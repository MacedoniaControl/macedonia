-- 45 · Cierre de mes: los meses del histórico que se cargan a mano
--
-- Pedido del usuario (12-10-2026): en Matrices Administrativas, cuando termina
-- un mes, un botón abre un formato para llenar ese mes (ventas, costo,
-- compras), sin esperar a regenerar el histórico desde los .xls de Valery.
--
-- El histórico de Valery (lib/ux/history-data.ts) sigue mandando: un mes
-- cargado aquí solo se usa si Valery todavía no lo trae. Lo mismo para las
-- dos empresas.
--
--   · Leer: quien puede ver la empresa.
--   · Cargar, corregir o borrar un mes: el Owner y los Administradores de esa
--     empresa.
--
-- Se puede correr más de una vez.

begin;

create table if not exists public.historico_meses (
  empresa_id     text not null references public.empresas(id),
  ym             text not null check (ym ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  venta          numeric(18,4) not null check (venta >= 0),
  costo          numeric(18,4) not null check (costo >= 0),
  compra         numeric(18,4) not null default 0 check (compra >= 0),
  venta_bs       numeric(18,4) not null default 0 check (venta_bs >= 0),
  costo_bs       numeric(18,4) not null default 0 check (costo_bs >= 0),
  compra_bs      numeric(18,4) not null default 0 check (compra_bs >= 0),
  nota           text,
  creado_por     uuid default auth.uid(),
  creado_nombre  text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, ym)
);

alter table public.historico_meses enable row level security;

drop policy if exists historico_meses_ver on public.historico_meses;
create policy historico_meses_ver on public.historico_meses
  for select using (public.puede_empresa(empresa_id));

drop policy if exists historico_meses_cargar on public.historico_meses;
create policy historico_meses_cargar on public.historico_meses
  for insert with check (public.puede_empresa(empresa_id) and public.puede_finanzas());

drop policy if exists historico_meses_corregir on public.historico_meses;
create policy historico_meses_corregir on public.historico_meses
  for update using (public.puede_empresa(empresa_id) and public.puede_finanzas())
  with check (public.puede_empresa(empresa_id) and public.puede_finanzas());

drop policy if exists historico_meses_borrar on public.historico_meses;
create policy historico_meses_borrar on public.historico_meses
  for delete using (public.puede_empresa(empresa_id) and public.puede_finanzas());

-- Un mes que todavía no terminó no se cierra.
create or replace function public.historico_meses_validar() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.ym >= to_char((now() at time zone 'America/Caracas')::date, 'YYYY-MM') then
    raise exception 'El mes % todavía no terminó: se carga cuando cierre.', new.ym;
  end if;
  new.actualizado_en := now();
  if tg_op = 'INSERT' or new.creado_nombre is null then
    new.creado_nombre := coalesce((select u.nombre from public.usuarios u where u.id = auth.uid()), new.creado_nombre, 'Sin nombre');
  end if;
  return new;
end $$;

drop trigger if exists historico_meses_validar on public.historico_meses;
create trigger historico_meses_validar before insert or update on public.historico_meses
  for each row execute function public.historico_meses_validar();

grant select, insert, update, delete on public.historico_meses to authenticated;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: tabla 1, politicas 4, disparador 1.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'historico_meses') as tabla,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'historico_meses') as politicas,
  (select count(*) from pg_trigger where tgname = 'historico_meses_validar') as disparador;
