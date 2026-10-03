-- 35 · Agregar cilindros al parque (nuevos, en buen estado o en mal estado)
--
-- «+ Agregar Cilindros» en Parque. Es SOLO para ampliar el parque: cilindros
-- que la empresa compra, recibe o recupera. Lo usan el Owner, un Administrador
-- y Almacén (técnico). Antes solo la gerencia podía dar de alta cilindros y
-- sin registro de quién los recibió ni de dónde venían.
--
-- Cada alta queda registrada con su número AC-AAAA-NNNNNN: fecha, de dónde
-- vienen (compra, traspaso, donación u otro), procedencia y documento, QUIÉN
-- los recibe (Almacén es una cuenta compartida: se escribe el nombre), y una
-- línea por gas con cantidad y condición:
--   · nuevo o usado en buen estado → entra lleno o vacío;
--   · en mal estado → entra «fuera de servicio», con el daño escrito.
-- Todos suman al total del parque. Los movimientos llevan el número del alta.
--
-- De paso se corrige la migración 33: el número de liquidación (LQ-…) era
-- único entre LAS DOS empresas, pero cada una lleva su propio correlativo; la
-- primera liquidación de Sudematin (LQ-2026-000001) chocaba con la de
-- Sumigases y no se guardaba. Ahora es único por empresa.
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------- 0. LIQUIDACIONES: NÚMERO POR EMPRESA
alter table public.liquidaciones drop constraint if exists liquidaciones_numero_key;
create unique index if not exists liquidaciones_empresa_numero on public.liquidaciones (empresa_id, numero);

-- ---------------------------------------------------------------- 1. TABLA
create table if not exists public.cilindros_altas (
  id             bigserial primary key,
  empresa_id     text not null references public.empresas(id),
  numero         text not null,
  fecha          date not null,
  origen         text not null check (origen in ('compra', 'traspaso', 'donacion', 'otro')),
  procedencia    text,
  documento      text,
  recibido_por   text not null check (length(trim(recibido_por)) > 0),
  nota           text,
  cilindros      integer not null check (cilindros > 0),
  lineas         jsonb not null,
  creado_por     uuid references public.usuarios(id),
  creado_nombre  text not null,
  creado_en      timestamptz not null default now()
);
create index if not exists cilindros_altas_empresa on public.cilindros_altas (empresa_id, creado_en desc);
-- Cada empresa lleva su correlativo: el número se repite entre empresas, no dentro de una.
create unique index if not exists cilindros_altas_empresa_numero on public.cilindros_altas (empresa_id, numero);

alter table public.cilindros_mov add column if not exists alta_id bigint references public.cilindros_altas(id);

-- La leen quienes operan cilindros. Se escribe solo con agregar_cilindros.
alter table public.cilindros_altas enable row level security;
drop policy if exists cilindros_altas_lectura on public.cilindros_altas;
create policy cilindros_altas_lectura on public.cilindros_altas for select using (
  public.puede_empresa(empresa_id) and (select public.puede_operar_cilindros()));
grant select on public.cilindros_altas to authenticated;

-- ---------------------------------------------------------------- 2. NÚMERO
create or replace function public.numero_alta_cilindros(p_empresa text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  hoy   date := (now() at time zone 'America/Caracas')::date;
  clave text := 'alta_cilindros_' || to_char(hoy, 'YYYY');
  n     bigint;
begin
  insert into public.correlativos (empresa_id, tipo, siguiente) values (p_empresa, clave, 1)
  on conflict (empresa_id, tipo) do nothing;
  update public.correlativos set siguiente = siguiente + 1
   where empresa_id = p_empresa and tipo = clave
  returning siguiente - 1 into n;
  return 'AC-' || to_char(hoy, 'YYYY') || '-' || lpad(n::text, 6, '0');
end $$;
revoke execute on function public.numero_alta_cilindros(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. AGREGAR
-- p_lineas: [{"gas": "OXIGENO", "cantidad": 5, "condicion": "nuevo", "estado": "vacio"},
--            {"gas": "ARGON", "cantidad": 2, "condicion": "mal_estado", "dano": "válvula dañada"}]
create or replace function public.agregar_cilindros(
  p_empresa text, p_fecha date, p_origen text, p_procedencia text, p_documento text,
  p_recibido_por text, p_nota text, p_lineas jsonb)
returns table (id bigint, numero text, cilindros integer)
language plpgsql security definer set search_path = public as $$
declare
  hoy     date := (now() at time zone 'America/Caracas')::date;
  v_nom   text;
  v_id    bigint;
  v_num   text;
  v_total integer := 0;
  v_ori   text := case p_origen when 'compra' then 'Compra' when 'traspaso' then 'Traspaso'
                                when 'donacion' then 'Donación' else 'Otro' end;
  l       jsonb;
  v_gas   text;
  v_cant  integer;
  v_cond  text;
  v_est   text;
  v_dano  text;
begin
  if not (public.puede_empresa(p_empresa) and public.puede_operar_cilindros()) then
    raise exception 'Agregar cilindros lo hacen el Owner, un Administrador o Almacén.';
  end if;
  if p_fecha is null or p_fecha > hoy then
    raise exception 'La fecha no puede ser posterior a hoy.';
  end if;
  if p_origen is null or p_origen not in ('compra', 'traspaso', 'donacion', 'otro') then
    raise exception 'Indica de dónde vienen los cilindros.';
  end if;
  if coalesce(trim(p_recibido_por), '') = '' then
    raise exception 'Indica quién recibe los cilindros.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos un gas con su cantidad.';
  end if;

  -- Primero se valida todo; si una línea está mal, no entra nada.
  for l in select * from jsonb_array_elements(p_lineas) loop
    v_gas  := upper(trim(l->>'gas'));
    v_cant := (l->>'cantidad')::integer;
    v_cond := l->>'condicion';
    v_est  := l->>'estado';
    if not exists (select 1 from public.gases g where g.empresa_id = p_empresa and g.nombre = v_gas and g.activo) then
      raise exception 'El gas % no está en la lista de esta empresa. Agrégalo con «Agregar un Gas».', coalesce(v_gas, '(vacío)');
    end if;
    if v_cant is null or v_cant <= 0 or v_cant > 1000 then
      raise exception '%: la cantidad tiene que ser entre 1 y 1000.', v_gas;
    end if;
    if v_cond = 'mal_estado' then
      if coalesce(trim(l->>'dano'), '') = '' then
        raise exception '%: indica qué daño tienen los cilindros en mal estado.', v_gas;
      end if;
    elsif v_cond in ('nuevo', 'buen_estado') then
      if coalesce(v_est, '') not in ('lleno', 'vacio') then
        raise exception '%: indica si entran llenos o vacíos.', v_gas;
      end if;
    else
      raise exception '%: indica la condición (nuevo, buen estado o mal estado).', v_gas;
    end if;
    v_total := v_total + v_cant;
  end loop;

  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();
  v_num := public.numero_alta_cilindros(p_empresa);
  insert into public.cilindros_altas (empresa_id, numero, fecha, origen, procedencia, documento, recibido_por, nota,
                                      cilindros, lineas, creado_por, creado_nombre)
  values (p_empresa, v_num, p_fecha, p_origen, nullif(trim(p_procedencia), ''), nullif(trim(p_documento), ''),
          trim(p_recibido_por), nullif(trim(p_nota), ''), v_total, p_lineas, auth.uid(), coalesce(v_nom, 'Sin nombre'))
  returning cilindros_altas.id into v_id;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_cond := l->>'condicion';
    insert into public.cilindros_mov (empresa_id, fecha, gas, cantidad, estado_desde, estado_hacia, documento, nota, usuario_id, alta_id)
    values (p_empresa, p_fecha, upper(trim(l->>'gas')), (l->>'cantidad')::integer, null,
            (case when v_cond = 'mal_estado' then 'fuera_servicio' else l->>'estado' end)::estado_cilindro,
            nullif(trim(p_documento), ''),
            concat_ws(' · ', 'Alta ' || v_num, v_ori,
                      case v_cond when 'nuevo' then 'nuevos' when 'buen_estado' then 'usados en buen estado' else 'en mal estado' end,
                      nullif(trim(p_procedencia), ''),
                      case when v_cond = 'mal_estado' then 'Daño: ' || trim(l->>'dano') end,
                      'Recibió ' || trim(p_recibido_por),
                      nullif(trim(p_nota), '')),
            auth.uid(), v_id);
  end loop;

  return query select v_id, v_num, v_total;
end $$;
revoke execute on function public.agregar_cilindros(text, date, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.agregar_cilindros(text, date, text, text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- 4. COMPROBACIÓN
-- Debe decir: tabla 1, columna 1, funcion 1, liquidaciones_por_empresa 1.
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename = 'cilindros_altas') as tabla,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'cilindros_mov' and column_name = 'alta_id') as columna,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'agregar_cilindros') as funcion,
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'liquidaciones_empresa_numero') as liquidaciones_por_empresa;
