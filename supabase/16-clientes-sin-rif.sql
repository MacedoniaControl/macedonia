-- ============================================================================
-- CLIENTES: EL RIF DEJA DE SER OBLIGATORIO
--
-- Lo puse como clave primaria copiando la ficha de Valery. Valery lo exige
-- porque factura; Macedonia no emite documentos fiscales, asi que no lo
-- necesita. Y de los 1.073 clientes de la cartera, 562 son personas naturales
-- que compran en el mostrador y no van a dar un RIF.
--
-- Con el RIF como clave, esos 562 no se podian cargar, y el vendedor quedaba
-- trabado con el cliente enfrente: justo lo que el selector queria evitar.
--
-- Ahora: id propio, y el RIF es opcional pero unico cuando esta. Postgres
-- permite varios NULL en una columna unique, que es exactamente lo que hace
-- falta aca.
-- ============================================================================

set search_path to public;

drop view  if exists public.clientes_saldo;
drop table if exists public.clientes;

create table public.clientes (
  id             bigserial primary key,
  rif            text unique,
  tipo_persona   tipo_persona not null default 'juridica',
  nombre         text not null,
  denominacion   text,
  contacto       text,
  correo         text,
  telefonos      text,
  direccion      text,
  ciudad         text,
  limite_credito numeric(14,2) not null default 0,
  dias_credito   integer not null default 0,
  notas          text,
  activo         boolean not null default true,
  creado_por     uuid references public.usuarios(id),
  created_at     timestamptz not null default now(),

  -- Un nombre vacio deja un cliente que nadie puede encontrar despues.
  constraint cli_nombre_no_vacio check (length(trim(nombre)) > 0),
  -- Si hay RIF, que sea un RIF; si no hay, que sea NULL y no cadena vacia
  -- (dos cadenas vacias chocarian contra el unique).
  constraint cli_rif_no_vacio   check (rif is null or length(trim(rif)) > 0)
);

alter table public.clientes enable row level security;

drop policy if exists clientes_lectura on public.clientes;
create policy clientes_lectura on public.clientes
  for select using (auth.uid() is not null);

drop policy if exists clientes_escribe on public.clientes;
create policy clientes_escribe on public.clientes
  for all using (auth.uid() is not null and auth_rol() in ('owner','admin','vendedor'))
  with check (auth.uid() is not null and auth_rol() in ('owner','admin','vendedor'));

create index if not exists clientes_busqueda on public.clientes (lower(nombre));

create view public.clientes_saldo with (security_invoker = on) as
select c.id, c.rif, c.nombre, c.limite_credito, cu.empresa_id,
       coalesce(sum(cu.monto - coalesce(ab.pagado, 0)), 0)::numeric(14,2) as debe
from public.clientes c
join public.cuentas cu on cu.contraparte = c.nombre and cu.tipo = 'cobrar'
left join lateral (
  select sum(a.monto) as pagado from public.abonos a where a.cuenta_id = cu.id
) ab on true
group by c.id, c.rif, c.nombre, c.limite_credito, cu.empresa_id;

select column_name, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='clientes' and column_name in ('id','rif','nombre')
 order by column_name;
