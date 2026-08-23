-- ============================================================================
-- CUENTAS POR COBRAR Y POR PAGAR
--
-- Una sola tabla con un `tipo`: la unica diferencia entre cobrar y pagar es
-- hacia donde va el dinero. Dos tablas identicas serian dos sitios donde
-- arreglar el mismo bug.
--
-- Los abonos van APARTE, no como una columna "abonado". Igual que el kardex:
-- el saldo se calcula. Una columna de saldo pierde CUANDO entro cada pago, que
-- es justo lo que hay que saber cuando un cliente discute una cuenta.
-- ============================================================================

create type tipo_cuenta as enum ('cobrar', 'pagar');

create table if not exists cuentas (
  id           bigserial primary key,
  empresa_id   text not null references empresas(id),
  tipo         tipo_cuenta not null,
  -- Cliente si es por cobrar, proveedor si es por pagar.
  contraparte  text not null,
  documento    text not null,
  monto        numeric(14,2) not null check (monto > 0),
  moneda       moneda_t not null default 'USD',
  emitida      date not null default current_date,
  vence        date not null,
  nota         text,
  usuario_id   uuid references usuarios(id),
  created_at   timestamptz not null default now(),

  -- Una cuenta que vence antes de emitirse es un error de carga.
  constraint vence_despues check (vence >= emitida)
);

create index if not exists cuentas_empresa_tipo on cuentas (empresa_id, tipo, vence);

create table if not exists abonos (
  id          bigserial primary key,
  cuenta_id   bigint not null references cuentas(id) on delete cascade,
  fecha       date not null default current_date,
  monto       numeric(14,2) not null check (monto > 0),
  metodo      text,
  referencia  text,
  usuario_id  uuid references usuarios(id),
  created_at  timestamptz not null default now()
);

alter table cuentas enable row level security;
alter table abonos  enable row level security;

-- Por cobrar la ve quien opera; por pagar es de compras y finanzas.
create policy cuentas_lectura on cuentas
  for select using (
    puede_empresa(empresa_id)
    and ((tipo = 'cobrar' and puede('receivables')) or (tipo = 'pagar' and puede('payables')))
  );
create policy cuentas_escribe on cuentas
  for all using (
    puede_empresa(empresa_id)
    and ((tipo = 'cobrar' and puede('receivables')) or (tipo = 'pagar' and puede('payables')))
  ) with check (
    puede_empresa(empresa_id)
    and ((tipo = 'cobrar' and puede('receivables')) or (tipo = 'pagar' and puede('payables')))
  );

create policy abonos_lectura on abonos
  for select using (exists (select 1 from cuentas c where c.id = cuenta_id));
create policy abonos_escribe on abonos
  for all using (exists (select 1 from cuentas c where c.id = cuenta_id))
  with check (exists (select 1 from cuentas c where c.id = cuenta_id));

-- ---------------------------------------------------------------------------
-- Saldo calculado. `dias` sale de current_date, NO de una fecha escrita a mano:
-- la pantalla anterior tenia el 23 de junio fijo en el codigo, asi que una
-- cuenta vencida hace dos meses se mostraba al dia.
-- ---------------------------------------------------------------------------
create view cuentas_saldo with (security_invoker = on) as
select c.id, c.empresa_id, c.tipo, c.contraparte, c.documento,
       c.monto, c.moneda, c.emitida, c.vence, c.nota,
       coalesce(sum(a.monto), 0)::numeric(14,2)          as abonado,
       (c.monto - coalesce(sum(a.monto), 0))::numeric(14,2) as saldo,
       (c.vence - current_date)::integer                  as dias
from cuentas c
left join abonos a on a.cuenta_id = c.id
group by c.id;
