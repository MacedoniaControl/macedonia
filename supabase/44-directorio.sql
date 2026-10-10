-- 44 · Directorio: la ficha de clientes y proveedores con el formato de Valery
--
-- Pedido del usuario (10-10-2026): un Directorio (en Operación) con clientes y
-- proveedores —los proveedores salen de Compras—, con lo que debe cada uno o lo
-- que le debemos, y una ficha como la de Valery. El RIF y la dirección de la
-- ficha llenan el estado de cuenta en PDF de Cuentas por Cobrar y por Pagar.
--
--   1. Campos de la ficha de Valery que faltaban: código, país, estado,
--      municipio, fax, referencia, grupo; y en el cliente zona de ventas, tipo
--      de precio, % de descuento especial y si acepta cheque.
--   2. El permiso «directory» para los Administradores que ya existen (los
--      nuevos lo traen de su plantilla). El Owner siempre entra.
--
-- Se puede correr más de una vez.

begin;

alter table public.clientes
  add column if not exists codigo         text,
  add column if not exists pais           text,
  add column if not exists estado_region  text,
  add column if not exists municipio      text,
  add column if not exists fax            text,
  add column if not exists referencia     text,
  add column if not exists grupo          text,
  add column if not exists zona_ventas    text,
  add column if not exists tipo_precio    text,
  add column if not exists descuento_pct  numeric(5,2) not null default 0,
  add column if not exists acepta_cheque  boolean not null default true;

alter table public.proveedores
  add column if not exists codigo         text,
  add column if not exists denominacion   text,
  add column if not exists pais           text,
  add column if not exists estado_region  text,
  add column if not exists municipio      text,
  add column if not exists fax            text,
  add column if not exists referencia     text,
  add column if not exists grupo          text;

update public.usuarios
   set permisos = coalesce(permisos, '{}'::jsonb) || '{"directory": true}'::jsonb
 where rol::text = 'admin' and not (coalesce(permisos, '{}'::jsonb) ? 'directory');

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: columnas_clientes 11, columnas_proveedores 8.
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'clientes'
    and column_name in ('codigo','pais','estado_region','municipio','fax','referencia','grupo','zona_ventas','tipo_precio','descuento_pct','acepta_cheque')) as columnas_clientes,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proveedores'
    and column_name in ('codigo','denominacion','pais','estado_region','municipio','fax','referencia','grupo')) as columnas_proveedores;
