-- 55 · Tasa USDT junto a la Tasa BCV
--
-- Pedido del usuario (11-11-2026): arriba de todas las pantallas, junto a la
-- Tasa BCV, la del USDT (usdt.com.ve: índice de referencia con los precios
-- públicos P2P de Binance y Bybit).
--
--   · tasas_usdt: cada lectura (la tasa de referencia, y la compra y la venta
--     si las publica). El USDT se mueve durante el día: se guarda cada una.
--   · usdt_estado: cómo le fue a la última consulta.
--   · La consulta la hace la misma tarea programada de la Tasa BCV (cada 30
--     minutos, migración 30): /api/bcv/actualizar trae las dos.
--
-- Solo se lee con la sesión; escribe el servidor. Se puede correr más de una vez.

begin;

create table if not exists public.tasas_usdt (
  id       bigserial primary key,
  leida_en timestamptz not null default now(),
  tasa     numeric(14,4) not null check (tasa > 0),
  compra   numeric(14,4) check (compra > 0),
  venta    numeric(14,4) check (venta > 0)
);
create index if not exists tasas_usdt_leida_en on public.tasas_usdt (leida_en desc);

create table if not exists public.usdt_estado (
  id              integer primary key default 1 check (id = 1),
  ultima_consulta timestamptz,
  ultimo_ok       timestamptz,
  ultimo_error    text
);
insert into public.usdt_estado (id) values (1) on conflict (id) do nothing;

alter table public.tasas_usdt  enable row level security;
alter table public.usdt_estado enable row level security;

drop policy if exists tasas_usdt_lectura on public.tasas_usdt;
create policy tasas_usdt_lectura on public.tasas_usdt for select to authenticated using (true);
drop policy if exists usdt_estado_lectura on public.usdt_estado;
create policy usdt_estado_lectura on public.usdt_estado for select to authenticated using (true);
revoke insert, update, delete on public.tasas_usdt, public.usdt_estado from anon, authenticated;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: tablas 2, rls 2, politicas 2, sin_escritura 1.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('tasas_usdt', 'usdt_estado')) as tablas,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('tasas_usdt', 'usdt_estado') and c.relrowsecurity) as rls,
  (select count(*) from pg_policies where schemaname = 'public' and policyname in ('tasas_usdt_lectura', 'usdt_estado_lectura')) as politicas,
  (select case when not has_table_privilege('authenticated', 'public.tasas_usdt', 'insert') then 1 else 0 end) as sin_escritura;
