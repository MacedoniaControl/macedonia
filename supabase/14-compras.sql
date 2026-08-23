-- ============================================================================
-- ORDENES DE COMPRA
--
-- Una orden se recibe POR PARTES: se piden 100 y llegan 60 hoy y 40 la semana
-- que viene. Por eso las recepciones van aparte, no como una columna
-- "recibido": esa columna pierde CUANDO llego cada parte, que es lo que se
-- necesita para reclamarle a un proveedor que se retraso.
--
-- Cada recepcion genera ademas un movimiento en el kardex: lo que entra al
-- almacen tiene que aparecer en la existencia.
-- ============================================================================

create table if not exists ordenes_compra (
  id           bigserial primary key,
  empresa_id   text not null references empresas(id),
  correlativo  text not null,
  proveedor    text not null,
  codigo       text not null,
  descripcion  text not null,
  cantidad     numeric(14,3) not null check (cantidad > 0),
  costo_usd    numeric(14,4) not null default 0,
  fecha        date not null default current_date,
  nota         text,
  usuario_id   uuid references usuarios(id),
  created_at   timestamptz not null default now(),
  unique (empresa_id, correlativo)
);

create table if not exists recepciones (
  id          bigserial primary key,
  orden_id    bigint not null references ordenes_compra(id) on delete cascade,
  fecha       date not null default current_date,
  cantidad    numeric(14,3) not null check (cantidad > 0),
  nota        text,
  usuario_id  uuid references usuarios(id),
  created_at  timestamptz not null default now()
);

alter table ordenes_compra enable row level security;
alter table recepciones    enable row level security;

create policy oc_lectura on ordenes_compra
  for select using (puede_empresa(empresa_id) and puede('purchases'));
create policy oc_escribe on ordenes_compra
  for all using (puede_empresa(empresa_id) and puede('purchases'))
  with check (puede_empresa(empresa_id) and puede('purchases'));

create policy rec_lectura on recepciones
  for select using (exists (select 1 from ordenes_compra o where o.id = orden_id));
create policy rec_escribe on recepciones
  for all using (exists (select 1 from ordenes_compra o where o.id = orden_id))
  with check (exists (select 1 from ordenes_compra o where o.id = orden_id));

-- ---------------------------------------------------------------------------
-- Estado calculado. Nadie escribe "Recibida parcial": se deduce de cuanto llego.
-- ---------------------------------------------------------------------------
create view ordenes_estado with (security_invoker = on) as
select o.id, o.empresa_id, o.correlativo, o.proveedor, o.codigo, o.descripcion,
       o.cantidad, o.costo_usd, o.fecha, o.nota,
       coalesce(sum(r.cantidad), 0)::numeric(14,3)              as recibido,
       (o.cantidad - coalesce(sum(r.cantidad), 0))::numeric(14,3) as pendiente,
       case
         when coalesce(sum(r.cantidad), 0) = 0            then 'abierta'
         when coalesce(sum(r.cantidad), 0) >= o.cantidad  then 'recibida'
         else 'parcial'
       end as estado
from ordenes_compra o
left join recepciones r on r.orden_id = o.id
group by o.id;
