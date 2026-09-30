-- 31 · El conteo de la Rampa ajusta al terminarlo; el Owner o un Administrador lo verifica
--
-- Antes (27) contar no ajustaba: el conteo quedaba pendiente y la Rampa
-- cambiaba recién cuando el Owner o un Administrador lo aprobaba.
--
-- Ahora, a pedido de la operación, la Rampa cambia en cuanto el Técnico (o
-- quien cuente) termina el conteo: cada diferencia entra como movimiento al
-- momento. El conteo igual queda «por verificar», con su alerta, y el Owner o
-- un Administrador decide:
--   · Verificar: certifica que el conteo es correcto. No mueve nada más.
--   · Rechazar: DESHACE el ajuste. Los movimientos del conteo quedan
--     eliminados en el historial, con el nombre de quien rechazó. Si deshacerlo
--     dejaría la Rampa en negativo (después del conteo salieron cilindros que
--     el conteo había sumado), no se puede: hay que contar de nuevo.
--
-- Sigue habiendo un solo conteo por verificar por empresa: así rechazar
-- siempre deshace el último ajuste y no pisa uno más nuevo.
--
-- Un conteo que quedó pendiente con la regla anterior (sin aplicar) se aplica
-- al verificarlo, como antes.
--
-- Se puede correr más de una vez.

alter table public.cilindros_conteos
  add column if not exists aplicado_en timestamptz;   -- cuándo entró a la Rampa (null = regla anterior, sin aplicar)

-- Los ya aprobados con la regla anterior entraron a la Rampa al aprobarse.
update public.cilindros_conteos set aplicado_en = resuelto_en
 where estado = 'aprobado' and aplicado_en is null;

comment on column public.cilindros_conteos.movimientos is 'Cuántos movimientos generó el conteo en la Rampa.';

-- ---------------------------------------------------------------- 1. APLICAR (uso interno)
create or replace function public.aplicar_conteo_cilindros(p_id bigint, p_nota text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  c     public.cilindros_conteos%rowtype;
  hoy   date := (now() at time zone 'America/Caracas')::date;
  r     record;
  n     integer := 0;
  queda integer;
begin
  select * into c from public.cilindros_conteos where cilindros_conteos.id = p_id for update;
  if c.aplicado_en is not null then return c.movimientos; end if;

  for r in select l.gas, l.estado, l.sistema, l.contado, l.contado - l.sistema as dif
             from public.cilindros_conteo_lineas l
            where l.conteo_id = p_id and l.contado <> l.sistema
            order by l.gas, l.estado loop
    -- Solo pasa con un conteo de la regla anterior: entre el conteo y hoy
    -- salieron cilindros que el conteo ya daba por perdidos.
    queda := public.saldo_cilindro(c.empresa_id, r.gas, r.estado) + r.dif;
    if queda < 0 then
      raise exception 'Aplicarlo dejaría % % en % (después del conteo hubo movimientos). Recházalo y cuenta de nuevo.',
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

  update public.cilindros_conteos set aplicado_en = now(), movimientos = n where cilindros_conteos.id = p_id;
  return n;
end $$;
revoke execute on function public.aplicar_conteo_cilindros(bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. REGISTRAR (Owner, Administrador o Técnico): ajusta al momento
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

  -- Uno a la vez por empresa: rechazar deshace el último ajuste, y con dos
  -- por verificar el rechazo del primero pisaría al segundo.
  perform pg_advisory_xact_lock(hashtext('cil_conteo:' || p_empresa));
  select c.numero into pend from public.cilindros_conteos c where c.empresa_id = p_empresa and c.estado = 'pendiente';
  if pend is not null then
    raise exception 'El conteo % todavía no está verificado. Cuando el Owner o un Administrador lo verifique podrás contar de nuevo.', pend;
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
    raise exception 'El conteo coincide con la Rampa: no hay nada que ajustar.';
  end if;

  -- La Rampa queda como se contó, ya.
  perform public.aplicar_conteo_cilindros(v_id);
  return query select v_id, v_numero, v_dif;
end $$;
revoke execute on function public.registrar_conteo_cilindros(text, jsonb, text) from public, anon;
grant execute on function public.registrar_conteo_cilindros(text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------- 3. VERIFICAR (Owner o Administrador)
-- Se sigue llamando «aprobar» para no cambiar la app. Devuelve los
-- movimientos que generó el conteo.
create or replace function public.aprobar_conteo_cilindros(p_id bigint, p_nota text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  c     public.cilindros_conteos%rowtype;
  v_nom text;
  n     integer;
begin
  select * into c from public.cilindros_conteos where cilindros_conteos.id = p_id for update;
  if not found then raise exception 'No existe el conteo %.', p_id; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador verifica conteos de la Rampa.';
  end if;
  if c.estado <> 'pendiente' then
    raise exception 'El conteo % ya está %.', c.numero, replace(c.estado, 'aprobado', 'verificado');
  end if;
  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();

  -- Un conteo de la regla anterior todavía no entró a la Rampa: entra ahora.
  n := public.aplicar_conteo_cilindros(p_id, p_nota);

  update public.cilindros_conteos
     set estado = 'aprobado', resuelto_en = now(), resuelto_por = auth.uid(),
         resuelto_nombre = coalesce(v_nom, 'Sin nombre'), resuelto_nota = nullif(trim(p_nota), '')
   where cilindros_conteos.id = p_id;
  return n;
end $$;
revoke execute on function public.aprobar_conteo_cilindros(bigint, text) from public, anon;
grant execute on function public.aprobar_conteo_cilindros(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 4. RECHAZAR (Owner o Administrador): deshace el ajuste
create or replace function public.rechazar_conteo_cilindros(p_id bigint, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c     public.cilindros_conteos%rowtype;
  v_nom text;
  r     record;
  queda integer;
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
    raise exception 'El conteo % ya está %.', c.numero, replace(c.estado, 'aprobado', 'verificado');
  end if;
  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();

  if c.aplicado_en is not null then
    -- Deshacer un sobrante no puede dejar la Rampa en negativo.
    for r in select m.gas, coalesce(m.estado_hacia, m.estado_desde) as estado,
                    sum(case when m.estado_hacia is not null then m.cantidad else -m.cantidad end)::integer as puso
               from public.cilindros_mov m
              where m.conteo_id = p_id and m.eliminado_en is null
              group by m.gas, coalesce(m.estado_hacia, m.estado_desde) loop
      queda := public.saldo_cilindro(c.empresa_id, r.gas, r.estado) - r.puso;
      if queda < 0 then
        raise exception 'Rechazarlo dejaría % % en % (después del conteo salieron cilindros). Cuenta la Rampa de nuevo en vez de rechazar.',
          r.gas, case when r.estado = 'lleno' then 'llenos' else 'vacíos' end, queda;
      end if;
    end loop;

    update public.cilindros_mov
       set eliminado_en = now(), eliminado_por = auth.uid(), eliminado_nombre = coalesce(v_nom, 'Sin nombre')
     where conteo_id = p_id and eliminado_en is null;
  end if;

  update public.cilindros_conteos
     set estado = 'rechazado', resuelto_en = now(), resuelto_por = auth.uid(),
         resuelto_nombre = coalesce(v_nom, 'Sin nombre'), resuelto_nota = trim(p_nota)
   where cilindros_conteos.id = p_id;
end $$;
revoke execute on function public.rechazar_conteo_cilindros(bigint, text) from public, anon;
grant execute on function public.rechazar_conteo_cilindros(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 5. COMPROBACIÓN
-- Debe decir: columna 1, funciones 4, pendientes_sin_aplicar = los conteos
-- de la regla anterior que todavía esperan (se aplican al verificarlos).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'cilindros_conteos' and column_name = 'aplicado_en') as columna,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('aplicar_conteo_cilindros', 'registrar_conteo_cilindros', 'aprobar_conteo_cilindros', 'rechazar_conteo_cilindros')) as funciones,
  (select count(*) from public.cilindros_conteos where estado = 'pendiente' and aplicado_en is null) as pendientes_sin_aplicar;
