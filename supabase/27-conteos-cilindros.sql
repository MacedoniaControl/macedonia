-- 27 · Conteos de la Rampa con aprobación
--
-- Igual que el inventario: contar no ajusta. El Técnico (o quien sea) cuenta
-- lo que hay en el galpón y el conteo queda PENDIENTE; el parque cambia
-- recién cuando el Owner o un Administrador lo aprueba. Rechazarlo exige un
-- motivo y no toca nada.
--
-- Al aprobar se aplica la DIFERENCIA que se vio al contar (contado − sistema
-- en ese momento), no «lo contado» a secas: si entre el conteo y la
-- aprobación salió una entrega, esa entrega sigue valiendo.
--
-- Hay un solo conteo pendiente por empresa a la vez. Con dos, aprobar ambos
-- sumaría la misma diferencia dos veces.
--
-- También cierra la puerta de atrás: el Técnico ya no puede insertar altas ni
-- bajas sueltas en cilindros_mov (la única alta que le queda es la del vacío
-- que un cliente devuelve sin figurar, que pasa en la calle).
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------- 1. TABLAS
create table if not exists public.cilindros_conteos (
  id              bigserial primary key,
  empresa_id      text not null references public.empresas(id),
  numero          text not null unique,          -- CR-2026-000001
  creado_en       timestamptz not null default now(),
  creado_por      uuid references public.usuarios(id),
  creado_nombre   text not null,
  motivo          text not null check (length(trim(motivo)) > 0),
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  resuelto_en     timestamptz,
  resuelto_por    uuid references public.usuarios(id),
  resuelto_nombre text,
  resuelto_nota   text,
  movimientos     integer                        -- cuántos movimientos generó al aprobarse
);

create unique index if not exists cil_conteo_un_pendiente
  on public.cilindros_conteos (empresa_id) where estado = 'pendiente';
create index if not exists cil_conteo_empresa_fecha
  on public.cilindros_conteos (empresa_id, creado_en desc);

create table if not exists public.cilindros_conteo_lineas (
  conteo_id bigint not null references public.cilindros_conteos(id) on delete cascade,
  gas       text not null,
  estado    public.estado_cilindro not null check (estado in ('lleno', 'vacio')),
  sistema   integer not null,                    -- lo que decía la Rampa al contar
  contado   integer not null check (contado >= 0),
  primary key (conteo_id, gas, estado)
);

alter table public.cilindros_mov
  add column if not exists conteo_id bigint references public.cilindros_conteos(id);

-- ---------------------------------------------------------------- 2. QUIÉN LOS VE
-- Los ven quienes operan cilindros: el Técnico tiene que saber que su conteo
-- espera aprobación. No hay políticas de escritura: todo pasa por las
-- funciones de abajo, que dejan constancia.
alter table public.cilindros_conteos enable row level security;
alter table public.cilindros_conteo_lineas enable row level security;

drop policy if exists cil_conteos_lectura on public.cilindros_conteos;
create policy cil_conteos_lectura on public.cilindros_conteos for select using (
  public.puede_empresa(empresa_id) and (select public.puede_operar_cilindros()));

drop policy if exists cil_conteo_lineas_lectura on public.cilindros_conteo_lineas;
create policy cil_conteo_lineas_lectura on public.cilindros_conteo_lineas for select using (
  exists (select 1 from public.cilindros_conteos c
           where c.id = conteo_id and public.puede_empresa(c.empresa_id))
  and (select public.puede_operar_cilindros()));

grant select on public.cilindros_conteos, public.cilindros_conteo_lineas to authenticated;

-- ---------------------------------------------------------------- 3. EL TÉCNICO NO AJUSTA POR SU CUENTA
drop policy if exists cil_mov_inserta on public.cilindros_mov;
create policy cil_mov_inserta on public.cilindros_mov for insert with check (
  public.puede_empresa(empresa_id) and (select public.puede_operar_cilindros()) and (
    (select public.puede_finanzas())
    -- Entregas, retornos y cambios de estado: mueven cilindros que ya existen.
    or (estado_desde is not null and estado_hacia is not null)
    -- El vacío que un cliente devuelve sin figurar con él: entra con su nombre.
    or (estado_desde is null and estado_hacia = 'vacio' and cliente is not null)
  ));

-- ---------------------------------------------------------------- 4. NÚMERO
create or replace function public.numero_conteo_cilindros(p_empresa text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  hoy   date := (now() at time zone 'America/Caracas')::date;
  clave text := 'conteo_cilindros_' || to_char(hoy, 'YYYY');
  n     bigint;
begin
  insert into public.correlativos (empresa_id, tipo, siguiente) values (p_empresa, clave, 1)
  on conflict (empresa_id, tipo) do nothing;
  update public.correlativos set siguiente = siguiente + 1
   where empresa_id = p_empresa and tipo = clave
  returning siguiente - 1 into n;
  return 'CR-' || to_char(hoy, 'YYYY') || '-' || lpad(n::text, 6, '0');
end $$;
revoke execute on function public.numero_conteo_cilindros(text) from public, anon, authenticated;

-- Saldo de un gas en un estado, sin lo eliminado. Uso interno.
create or replace function public.saldo_cilindro(p_empresa text, p_gas text, p_estado public.estado_cilindro)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when m.estado_hacia = p_estado then m.cantidad else 0 end)
                - sum(case when m.estado_desde = p_estado then m.cantidad else 0 end), 0)::integer
    from public.cilindros_mov m
   where m.empresa_id = p_empresa and m.gas = p_gas and m.eliminado_en is null
     and (m.estado_hacia = p_estado or m.estado_desde = p_estado)
$$;
revoke execute on function public.saldo_cilindro(text, text, public.estado_cilindro) from public, anon, authenticated;

-- ---------------------------------------------------------------- 5. REGISTRAR (Owner, Administrador o Técnico)
-- p_lineas: [{"gas": "OXIGENO", "lleno": 50, "vacio": 4, "visto_lleno": 56, "visto_vacio": 0}, …]
-- «visto_*» es lo que la persona tenía en pantalla. Si ya no coincide con la
-- Rampa, alguien registró algo mientras contaba y se pide volver a mirar.
create or replace function public.registrar_conteo_cilindros(p_empresa text, p_lineas jsonb, p_motivo text)
returns table (id bigint, numero text, diferencias integer)
language plpgsql security definer set search_path = public as $$
declare
  v_id     bigint;
  v_numero text;
  v_nombre text;
  v_dif    integer := 0;
  l        jsonb;
  e        text;
  v_sis    integer;
  v_cont   integer;
  v_visto  integer;
  pend     text;
begin
  if not (public.puede_empresa(p_empresa) and public.puede_operar_cilindros()) then
    raise exception 'Contar la Rampa lo hacen el Owner, un Administrador o un Técnico.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Explica por qué no cuadra: queda en el historial.';
  end if;
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El conteo no trae gases.';
  end if;

  -- Uno a la vez por empresa: dos conteos al mismo tiempo se pisarían.
  perform pg_advisory_xact_lock(hashtext('cil_conteo:' || p_empresa));
  select c.numero into pend from public.cilindros_conteos c where c.empresa_id = p_empresa and c.estado = 'pendiente';
  if pend is not null then
    raise exception 'Ya hay un conteo esperando aprobación (%). Cuando el Owner o un Administrador lo resuelva podrás enviar otro.', pend;
  end if;

  select u.nombre into v_nombre from public.usuarios u where u.id = auth.uid();
  v_numero := public.numero_conteo_cilindros(p_empresa);
  insert into public.cilindros_conteos (empresa_id, numero, creado_por, creado_nombre, motivo)
  values (p_empresa, v_numero, auth.uid(), coalesce(v_nombre, 'Sin nombre'), trim(p_motivo))
  returning cilindros_conteos.id into v_id;

  for l in select x.value from jsonb_array_elements(p_lineas) as x loop
    if not exists (select 1 from public.gases g where g.empresa_id = p_empresa and g.nombre = l->>'gas' and g.activo) then
      raise exception 'El gas % no está activo en esta empresa.', l->>'gas';
    end if;
    foreach e in array array['lleno', 'vacio'] loop
      if jsonb_typeof(l->e) is distinct from 'number' or (l->>e)::numeric <> trunc((l->>e)::numeric) or (l->>e)::numeric < 0 then
        raise exception 'Revisa %: la cantidad tiene que ser un número entero, cero o más.', l->>'gas';
      end if;
      v_cont  := (l->>e)::integer;
      v_visto := coalesce((l->>('visto_' || e))::integer, 0);
      v_sis   := public.saldo_cilindro(p_empresa, l->>'gas', e::public.estado_cilindro);
      if v_visto <> v_sis then
        raise exception 'La Rampa cambió mientras contabas (alguien registró un movimiento). Revisa los números y envíalo otra vez.';
      end if;
      insert into public.cilindros_conteo_lineas (conteo_id, gas, estado, sistema, contado)
      values (v_id, l->>'gas', e::public.estado_cilindro, v_sis, v_cont);
      if v_cont <> v_sis then v_dif := v_dif + 1; end if;
    end loop;
  end loop;

  if v_dif = 0 then
    raise exception 'El conteo coincide con la Rampa: no hay nada que aprobar.';
  end if;
  return query select v_id, v_numero, v_dif;
end $$;
revoke execute on function public.registrar_conteo_cilindros(text, jsonb, text) from public, anon;
grant execute on function public.registrar_conteo_cilindros(text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------- 6. APROBAR (Owner o Administrador)
create or replace function public.aprobar_conteo_cilindros(p_id bigint, p_nota text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  c      public.cilindros_conteos%rowtype;
  hoy    date := (now() at time zone 'America/Caracas')::date;
  v_nom  text;
  r      record;
  n      integer := 0;
  queda  integer;
begin
  select * into c from public.cilindros_conteos where cilindros_conteos.id = p_id for update;
  if not found then raise exception 'No existe el conteo %.', p_id; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador aprueba conteos de la Rampa.';
  end if;
  if c.estado <> 'pendiente' then
    raise exception 'El conteo % ya está %.', c.numero, c.estado;
  end if;
  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();

  for r in select l.gas, l.estado, l.sistema, l.contado, l.contado - l.sistema as dif
             from public.cilindros_conteo_lineas l
            where l.conteo_id = p_id and l.contado <> l.sistema
            order by l.gas, l.estado loop
    -- Un faltante no puede dejar el saldo en negativo: pasaría si después del
    -- conteo salieron cilindros que el conteo ya daba por perdidos.
    queda := public.saldo_cilindro(c.empresa_id, r.gas, r.estado) + r.dif;
    if queda < 0 then
      raise exception 'Aprobarlo dejaría % % en % (después del conteo hubo movimientos). Recházalo y pide un conteo nuevo.',
        r.gas, case when r.estado = 'lleno' then 'llenos' else 'vacíos' end, queda;
    end if;
    insert into public.cilindros_mov (empresa_id, fecha, gas, cantidad, estado_desde, estado_hacia, nota, usuario_id, conteo_id)
    values (c.empresa_id, hoy, r.gas, abs(r.dif),
            case when r.dif < 0 then r.estado end,
            case when r.dif > 0 then r.estado end,
            'Conteo de rampa ' || c.numero || ': el sistema decía ' || r.sistema || ', se contaron ' || r.contado ||
              '. ' || c.motivo || coalesce(' · ' || nullif(trim(p_nota), ''), ''),
            auth.uid(), p_id);
    n := n + 1;
  end loop;

  update public.cilindros_conteos
     set estado = 'aprobado', resuelto_en = now(), resuelto_por = auth.uid(),
         resuelto_nombre = coalesce(v_nom, 'Sin nombre'), resuelto_nota = nullif(trim(p_nota), ''), movimientos = n
   where cilindros_conteos.id = p_id;
  return n;
end $$;
revoke execute on function public.aprobar_conteo_cilindros(bigint, text) from public, anon;
grant execute on function public.aprobar_conteo_cilindros(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 7. RECHAZAR (Owner o Administrador)
create or replace function public.rechazar_conteo_cilindros(p_id bigint, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c     public.cilindros_conteos%rowtype;
  v_nom text;
begin
  select * into c from public.cilindros_conteos where cilindros_conteos.id = p_id for update;
  if not found then raise exception 'No existe el conteo %.', p_id; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador decide sobre un conteo de la Rampa.';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Indica por qué se rechaza: sin motivo nadie sabe qué recontar.';
  end if;
  if c.estado <> 'pendiente' then
    raise exception 'El conteo % ya está %.', c.numero, c.estado;
  end if;
  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();
  update public.cilindros_conteos
     set estado = 'rechazado', resuelto_en = now(), resuelto_por = auth.uid(),
         resuelto_nombre = coalesce(v_nom, 'Sin nombre'), resuelto_nota = trim(p_nota), movimientos = 0
   where cilindros_conteos.id = p_id;
end $$;
revoke execute on function public.rechazar_conteo_cilindros(bigint, text) from public, anon;
grant execute on function public.rechazar_conteo_cilindros(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 8. COMPROBACIÓN
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename in ('cilindros_conteos', 'cilindros_conteo_lineas')) as tablas,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('registrar_conteo_cilindros', 'aprobar_conteo_cilindros', 'rechazar_conteo_cilindros')) as funciones,
  (select count(*) from pg_policies where tablename = 'cilindros_mov' and policyname = 'cil_mov_inserta') as politica_insercion;
