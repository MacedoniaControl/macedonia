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
