-- 30 · Tasa BCV automática, cada 30 minutos, para todos
--
-- Antes la tasa la consultaba el navegador de cada persona y la guardaba en
-- ese navegador: cada computadora y cada teléfono podía tener una tasa
-- distinta, y si nadie abría las pantallas que la piden, se quedaba vieja.
--
-- Ahora la base la pide sola cada 30 minutos (pg_cron + pg_net llaman a
-- /api/bcv/actualizar en Vercel, que lee bcv.org.ve) y la guarda aquí. Todos
-- los equipos leen la misma.
--
-- Se guarda por FECHA VALOR: en la tarde el BCV publica la del siguiente día
-- hábil. La que vale hoy es la última con fecha valor ≤ hoy.
--
-- Se puede correr más de una vez.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------- 1. TASAS
create table if not exists public.tasas_bcv (
  fecha_valor date primary key,
  tasa        numeric(14,4) not null check (tasa > 0),
  primera_vez timestamptz not null default now(),   -- cuándo se vio por primera vez
  ultima_vez  timestamptz not null default now()    -- la última consulta que la confirmó
);

-- Una sola fila: cómo le fue a la última consulta.
create table if not exists public.bcv_estado (
  id              integer primary key default 1 check (id = 1),
  ultima_consulta timestamptz,
  ultimo_ok       timestamptz,
  ultimo_error    text
);
insert into public.bcv_estado (id) values (1) on conflict (id) do nothing;

-- La clave con la que la tarea programada se identifica ante Vercel. Se crea
-- aquí, no pasa por ningún chat ni archivo, y solo la leen el servidor
-- (service_role) y la propia tarea.
create table if not exists public.bcv_token (
  id    integer primary key default 1 check (id = 1),
  token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
);
insert into public.bcv_token (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- 2. QUIÉN LEE
-- La tasa y su estado los lee cualquiera con sesión. Escribe solo el servidor.
alter table public.tasas_bcv  enable row level security;
alter table public.bcv_estado enable row level security;
alter table public.bcv_token  enable row level security;

drop policy if exists tasas_bcv_lectura on public.tasas_bcv;
create policy tasas_bcv_lectura on public.tasas_bcv for select to authenticated using (true);
drop policy if exists bcv_estado_lectura on public.bcv_estado;
create policy bcv_estado_lectura on public.bcv_estado for select to authenticated using (true);
-- bcv_token: sin políticas. Nadie de la app la ve.
revoke all on public.bcv_token from anon, authenticated;

-- ---------------------------------------------------------------- 3. CADA 30 MINUTOS
do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'tasa-bcv' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule('tasa-bcv', '*/30 * * * *', $cron$
  select net.http_post(
    url := 'https://sumicontrol.vercel.app/api/bcv/actualizar',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-bcv-token', (select token from public.bcv_token where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$cron$);

-- ---------------------------------------------------------------- 4. COMPROBACIÓN
-- Debe decir la tarea programada cada 30 minutos.
select jobname, schedule, active from cron.job where jobname = 'tasa-bcv';
