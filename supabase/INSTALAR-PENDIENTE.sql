-- ============================================================================
-- MACEDONIA — LO QUE FALTA EJECUTAR
--
-- Pegar TODO en: panel de Supabase -> SQL Editor -> New query -> Run
--
--   12-configuracion   IVA y ajustes compartidos por empresa
--   14-compras         ordenes de compra con recepciones parciales
--   15-clientes        clientes y proveedores (ficha compartida entre empresas)
--
-- Al final hay una comprobacion: debe devolver 6 filas diciendo OK.
-- ============================================================================


-- ####################  12-configuracion  ####################

-- ============================================================================
-- CONFIGURACION POR EMPRESA
--
-- Hasta ahora vivia en localStorage, o sea que CADA PERSONA tenia la suya. Para
-- un color de tema da igual; para el IVA y la tasa del dolar no: dos vendedores
-- con IVA distinto emiten documentos con totales distintos por el mismo
-- producto, y nadie se entera hasta que el cliente reclama.
--
-- Formato clave/valor en vez de una columna por ajuste: agregar un ajuste nuevo
-- es insertar una fila, no migrar la tabla.
-- ============================================================================

create table if not exists configuracion (
  empresa_id text not null references empresas(id),
  clave      text not null,
  valor      text not null,
  actualizado_por uuid references usuarios(id),
  actualizado_en  timestamptz not null default now(),
  primary key (empresa_id, clave)
);

alter table configuracion enable row level security;

-- La lee cualquiera que entre a la empresa: el IVA lo necesita el vendedor para
-- calcular un total, no solo el administrador.
create policy config_lectura on configuracion
  for select using (puede_empresa(empresa_id));

-- La cambian owner y admin. Un vendedor que pudiera mover el IVA o la tasa
-- estaria cambiando el precio de todo sin pasar por nadie.
create policy config_escribe on configuracion
  for all using (puede_empresa(empresa_id) and puede('settings') and auth_rol() in ('owner','admin'))
  with check (puede_empresa(empresa_id) and puede('settings') and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------------------
-- Valores de arranque
-- ---------------------------------------------------------------------------
insert into configuracion (empresa_id, clave, valor) values
  ('sumigases', 'iva_pct',            '16'),
  ('sumigases', 'tasa_manual',        '0'),
  ('sumigases', 'dias_vencimiento_cotizacion', '3'),
  ('sumigases', 'alerta_comodato_dias', '60'),
  ('sudematin', 'iva_pct',            '16'),
  ('sudematin', 'tasa_manual',        '0'),
  ('sudematin', 'dias_vencimiento_cotizacion', '3'),
  ('sudematin', 'alerta_comodato_dias', '60')
on conflict (empresa_id, clave) do nothing;

-- tasa_manual en 0 significa "usar la tasa del BCV". Solo se pone un numero
-- distinto para forzar una tasa a mano, y conviene que sea evidente cuando pasa.

-- ####################  14-compras  ####################

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

-- ####################  15-clientes-proveedores  ####################

-- ============================================================================
-- CLIENTES Y PROVEEDORES
--
-- DECISION (Greeg, 2026-08-22): la FICHA del cliente se comparte entre las dos
-- empresas — son de los mismos duenos y cargar el mismo cliente dos veces es
-- trabajo duplicado que ademas produce dos versiones del mismo nombre.
--
-- Pero los DOCUMENTOS siguen separados: un vendedor de Sudematin ve al cliente,
-- no ve lo que le vendio Sumigases. La pared sigue en pie donde importa.
--
-- Por eso estas tablas NO llevan empresa_id: son un directorio comun, no datos
-- de operacion.
--
-- EL RIF ES EL CODIGO. No hay un correlativo aparte que alguien tenga que
-- inventar y que pueda repetirse.
-- ============================================================================

create type tipo_persona as enum ('natural', 'juridica');

create table if not exists clientes (
  rif             text primary key,
  tipo_persona    tipo_persona not null default 'juridica',
  nombre          text not null,
  denominacion    text,              -- Contribuyente ORDINARIO, ESPECIAL, etc.
  contacto        text,
  correo          text,
  telefonos       text,
  direccion       text,
  ciudad          text,
  -- Aviso al emitir si el cliente lo supera. NO bloquea: nadie queda trabado
  -- en el mostrador con el cliente enfrente.
  limite_credito  numeric(14,2) not null default 0,
  dias_credito    integer not null default 0,
  notas           text,
  activo          boolean not null default true,
  creado_por      uuid references usuarios(id),
  created_at      timestamptz not null default now(),

  constraint rif_no_vacio check (length(trim(rif)) > 0)
);

create table if not exists proveedores (
  rif             text primary key,
  tipo_persona    tipo_persona not null default 'juridica',
  nombre          text not null,
  nacional        boolean not null default true,
  contacto        text,
  correo          text,
  telefonos       text,
  direccion       text,
  ciudad          text,
  dias_credito    integer not null default 0,
  limite_credito  numeric(14,2) not null default 0,
  -- Informativo: Macedonia no emite documentos fiscales, asi que no calcula
  -- retenciones. Se guarda para que quien cargue una compra lo tenga a mano.
  pct_retencion   numeric(5,2) not null default 0,
  notas           text,
  activo          boolean not null default true,
  creado_por      uuid references usuarios(id),
  created_at      timestamptz not null default now(),

  constraint prov_rif_no_vacio check (length(trim(rif)) > 0)
);

alter table clientes    enable row level security;
alter table proveedores enable row level security;

-- Directorio comun: lo lee cualquiera con sesion, de cualquiera de las dos
-- empresas. Es la excepcion deliberada a la pared.
create policy clientes_lectura on clientes
  for select using (auth.uid() is not null);
create policy clientes_escribe on clientes
  for all using (auth.uid() is not null and auth_rol() in ('owner','admin','vendedor'))
  with check (auth.uid() is not null and auth_rol() in ('owner','admin','vendedor'));

create policy proveedores_lectura on proveedores
  for select using (auth.uid() is not null);
-- Los proveedores los carga quien compra, no cualquiera que venda.
create policy proveedores_escribe on proveedores
  for all using (auth.uid() is not null and auth_rol() in ('owner','admin'))
  with check (auth.uid() is not null and auth_rol() in ('owner','admin'));

-- Buscar por nombre o RIF sin distinguir mayusculas ni acentos.
create index if not exists clientes_busqueda on clientes (lower(nombre));
create index if not exists proveedores_busqueda on proveedores (lower(nombre));

-- ---------------------------------------------------------------------------
-- Los documentos pasan a apuntar al cliente por RIF, sin dejar de guardar el
-- nombre: si manana alguien corrige la ficha, el papel ya emitido no cambia.
-- ---------------------------------------------------------------------------
alter table documentos
  add column if not exists cliente_rif_ref text references clientes(rif);

-- ---------------------------------------------------------------------------
-- Saldo del cliente por empresa. Para el aviso de limite de credito: cuanto
-- debe EN ESTA empresa, no en las dos sumadas.
-- ---------------------------------------------------------------------------
create view clientes_saldo with (security_invoker = on) as
select c.rif, c.nombre, c.limite_credito, cu.empresa_id,
       coalesce(sum(cu.monto - coalesce(ab.pagado, 0)), 0)::numeric(14,2) as debe
from clientes c
join cuentas cu on cu.contraparte = c.nombre and cu.tipo = 'cobrar'
left join lateral (
  select sum(a.monto) as pagado from abonos a where a.cuenta_id = cu.id
) ab on true
group by c.rif, c.nombre, c.limite_credito, cu.empresa_id;

-- ####################  COMPROBACION  ####################

select 'configuracion' as tabla,
       case when to_regclass('public.configuracion') is not null then 'OK' else 'FALTA' end as estado
union all
select 'ordenes_compra', case when to_regclass('public.ordenes_compra') is not null then 'OK' else 'FALTA' end
union all
select 'recepciones',    case when to_regclass('public.recepciones')    is not null then 'OK' else 'FALTA' end
union all
select 'clientes',       case when to_regclass('public.clientes')       is not null then 'OK' else 'FALTA' end
union all
select 'proveedores',    case when to_regclass('public.proveedores')    is not null then 'OK' else 'FALTA' end
union all
select 'vistas nuevas',  case when to_regclass('public.ordenes_estado') is not null
                              and to_regclass('public.clientes_saldo')  is not null
                         then 'OK' else 'FALTA' end;
