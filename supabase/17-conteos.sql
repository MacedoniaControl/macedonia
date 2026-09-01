-- ============================================================================
-- CONTEO FISICO
--
-- Es la razon de ser de Macedonia: el papel dice una cosa y el galpon dice otra,
-- y esa diferencia no la muestra nadie. Hasta ahora el Master comparaba dos
-- numeros que salian AMBOS del kardex, asi que no podia detectar lo que se fue
-- sin registrarse — que es justo lo que hay que ver.
--
-- Un conteo es una SESION, no un evento unico: con 4.303 productos, contar todo
-- de una sentada no pasa nunca. Se cuenta una zona, otro dia otra, y el Master
-- muestra la fecha de cada conteo. Un conteo de hace tres meses no dice nada de
-- hoy, y esconderlo seria peor que no tenerlo.
--
-- El conteo NO corrige el inventario. Solo deja constancia de lo que se conto.
-- Un ajuste automatico borraria la evidencia de que algo falta.
-- ============================================================================

set search_path to public;

create table if not exists public.conteos (
  id          bigserial primary key,
  empresa_id  text not null references public.empresas(id),
  fecha       date not null default current_date,
  zona        text,                      -- "Galpon 2", "Rampa", lo que usen
  nota        text,
  cerrado     boolean not null default false,
  usuario_id  uuid references public.usuarios(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.conteo_lineas (
  id         bigserial primary key,
  conteo_id  bigint not null references public.conteos(id) on delete cascade,
  codigo     text not null,
  -- Cero es un dato valido y de los mas importantes: significa "fui, mire, y no
  -- hay ninguno". Es distinto de no haber contado.
  cantidad   numeric(14,3) not null check (cantidad >= 0),
  created_at timestamptz not null default now(),

  -- Un codigo una sola vez por conteo: si se cuenta dos veces, la segunda pisa
  -- a la primera en vez de sumarse.
  unique (conteo_id, codigo)
);

create index if not exists conteo_lineas_codigo on public.conteo_lineas (codigo);
create index if not exists conteos_empresa_fecha on public.conteos (empresa_id, fecha desc);

alter table public.conteos       enable row level security;
alter table public.conteo_lineas enable row level security;

drop policy if exists conteos_lectura on public.conteos;
create policy conteos_lectura on public.conteos
  for select using (puede_empresa(empresa_id) and puede('inventory'));

-- Cuenta quien esta en el galpon: el tecnico de almacen tambien.
drop policy if exists conteos_escribe on public.conteos;
create policy conteos_escribe on public.conteos
  for all using (puede_empresa(empresa_id) and puede('inventory'))
  with check (puede_empresa(empresa_id) and puede('inventory'));

drop policy if exists conteo_lineas_lectura on public.conteo_lineas;
create policy conteo_lineas_lectura on public.conteo_lineas
  for select using (exists (select 1 from public.conteos c where c.id = conteo_id));

drop policy if exists conteo_lineas_escribe on public.conteo_lineas;
create policy conteo_lineas_escribe on public.conteo_lineas
  for all using (exists (select 1 from public.conteos c where c.id = conteo_id))
  with check (exists (select 1 from public.conteos c where c.id = conteo_id));

-- ---------------------------------------------------------------------------
-- El ultimo conteo de cada producto, con SU fecha.
--
-- distinct on toma la primera fila de cada codigo segun el orden: el conteo mas
-- reciente. La fecha viaja con el numero porque sin ella el numero engaña.
-- ---------------------------------------------------------------------------
create or replace view public.ultimo_conteo with (security_invoker = on) as
select distinct on (c.empresa_id, l.codigo)
       c.empresa_id,
       l.codigo,
       l.cantidad,
       c.fecha,
       c.zona,
       c.id as conteo_id
from public.conteo_lineas l
join public.conteos c on c.id = l.conteo_id
where c.cerrado
order by c.empresa_id, l.codigo, c.fecha desc, c.id desc;

select table_name from information_schema.tables
 where table_schema='public' and table_name in ('conteos','conteo_lineas')
union all
select table_name from information_schema.views
 where table_schema='public' and table_name = 'ultimo_conteo'
 order by 1;
