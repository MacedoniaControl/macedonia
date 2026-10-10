-- 43 · Liquidaciones: no se eliminan sus notas; se modifican y se restablecen
--
-- Pedido del usuario (10-10-2026):
--   · Una nota que está en una liquidación activa NO se elimina: primero se
--     anula la liquidación. (Deja «Eliminar» como en la 38, por si se llegó a
--     correr la 42, que lo permitía.)
--   · Una liquidación activa se puede modificar: fecha, método, referencia y
--     nota del pago (las notas y los montos no: para eso se anula).
--   · Una liquidación anulada se puede restablecer: vuelve a quedar activa con
--     las mismas notas y los mismos montos. Para poder hacerlo, al anular se
--     guarda lo que tenía.
-- Lo hacen el Owner o un Administrador. Se puede correr más de una vez.

begin;

-- ---------------------------------------------------------------- 1. COLUMNAS
alter table public.liquidaciones
  add column if not exists detalle             jsonb,
  add column if not exists modificada_en       timestamptz,
  add column if not exists modificada_nombre   text,
  add column if not exists restablecida_en     timestamptz,
  add column if not exists restablecida_nombre text;
comment on column public.liquidaciones.detalle is 'Al anular: los abonos que tenía (cuenta, monto, si la saldó), para poder restablecerla.';

-- ---------------------------------------------------------------- 2. ELIMINAR: NO SI ESTÁ EN UNA LIQUIDACIÓN ACTIVA
create or replace function public.eliminar_cuentas(p_empresa text, p_ids bigint[])
returns table (cuentas integer, rutas text[])
language plpgsql security definer set search_path = public as $$
declare
  v_n     integer;
  v_lq    text;
  v_rutas text[];
begin
  if not (public.puede_empresa(p_empresa) and public.puede_finanzas()) then
    raise exception 'Eliminar cuentas lo hacen el Owner o un Administrador.';
  end if;
  if coalesce((select valor from public.configuracion where empresa_id = p_empresa and clave = 'eliminar_cuentas'), 'si') = 'no' then
    raise exception 'El Owner deshabilitó «Eliminar» en esta empresa.';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Elige al menos una cuenta.';
  end if;

  perform 1 from public.cuentas c where c.id = any (p_ids) for update;
  select count(*) into v_n from public.cuentas c where c.id = any (p_ids);
  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguna de las cuentas ya no existe.';
  end if;
  if exists (select 1 from public.cuentas c where c.id = any (p_ids) and c.empresa_id <> p_empresa) then
    raise exception 'Todas las cuentas tienen que ser de esta empresa.';
  end if;
  if exists (select 1 from public.cuentas c where c.id = any (p_ids)
              and not ((c.tipo = 'cobrar' and public.puede('receivables')) or (c.tipo = 'pagar' and public.puede('payables')))) then
    raise exception 'No tienes acceso a una de esas carteras.';
  end if;

  select string_agg(distinct c.documento || ' en ' || l.numero, ', ') into v_lq
    from public.abonos a
    join public.liquidaciones l on l.id = a.liquidacion_id and l.anulada_en is null
    join public.cuentas c on c.id = a.cuenta_id
   where a.cuenta_id = any (p_ids);
  if v_lq is not null then
    raise exception 'Las notas que intentas eliminar están dentro de una liquidación activa (%). No está permitido eliminarlas: anula la liquidación primero.', v_lq;
  end if;

  select array_agg(distinct r) into v_rutas from (
    select c.imagen_ruta r from public.cuentas c where c.id = any (p_ids) and c.imagen_ruta is not null
    union
    select a.imagen_ruta from public.abonos a where a.cuenta_id = any (p_ids) and a.imagen_ruta is not null
       and not exists (select 1 from public.liquidaciones l where l.imagen_ruta = a.imagen_ruta)
  ) f;

  delete from public.abonos a where a.cuenta_id = any (p_ids);
  delete from public.cuentas c where c.id = any (p_ids);
  get diagnostics v_n = row_count;
  return query select v_n, coalesce(v_rutas, '{}'::text[]);
end $$;
revoke execute on function public.eliminar_cuentas(text, bigint[]) from public, anon;
grant execute on function public.eliminar_cuentas(text, bigint[]) to authenticated;

-- ---------------------------------------------------------------- 3. ANULAR: GUARDA LO QUE TENÍA
create or replace function public.anular_liquidacion(p_id bigint, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  l     public.liquidaciones%rowtype;
  v_nom text;
  n     integer;
begin
  select * into l from public.liquidaciones where liquidaciones.id = p_id for update;
  if not found then raise exception 'No existe la liquidación %.', p_id; end if;
  if not (public.puede_empresa(l.empresa_id) and public.puede_finanzas()) then
    raise exception 'Anular una liquidación lo hacen el Owner o un Administrador.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica por qué se anula: queda en el registro.';
  end if;
  if l.anulada_en is not null then
    raise exception 'La liquidación % ya está anulada.', l.numero;
  end if;
  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();

  -- Lo que tenía, para poder restablecerla.
  update public.liquidaciones set detalle = (
    select jsonb_agg(jsonb_build_object(
             'cuenta_id', a.cuenta_id, 'monto', a.monto, 'fecha', a.fecha, 'metodo', a.metodo,
             'referencia', a.referencia, 'imagen_ruta', a.imagen_ruta,
             'saldada', (c.estado = 'liquidada' and c.liquidada_nota like 'Liquidación ' || l.numero || '%'),
             'liquidada_nota', c.liquidada_nota) order by a.id)
      from public.abonos a join public.cuentas c on c.id = a.cuenta_id
     where a.liquidacion_id = p_id)
   where liquidaciones.id = p_id;

  -- Las cuentas vuelven a quedar abiertas (solo las que cerró esta liquidación).
  update public.cuentas c
     set estado = 'abierta', liquidada_en = null, liquidada_por = null, liquidada_como = null, liquidada_nota = null
   where c.id in (select a.cuenta_id from public.abonos a where a.liquidacion_id = p_id)
     and c.estado = 'liquidada' and c.liquidada_nota like 'Liquidación ' || l.numero || '%';
  delete from public.abonos a where a.liquidacion_id = p_id;
  get diagnostics n = row_count;

  update public.liquidaciones
     set anulada_en = now(), anulada_por = auth.uid(), anulada_nombre = coalesce(v_nom, 'Sin nombre'), anulada_motivo = trim(p_motivo)
   where liquidaciones.id = p_id;
  return n;
end $$;
revoke execute on function public.anular_liquidacion(bigint, text) from public, anon;
grant execute on function public.anular_liquidacion(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 4. RESTABLECER
create or replace function public.restablecer_liquidacion(p_id bigint)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  l      public.liquidaciones%rowtype;
  v_nom  text;
  d      jsonb;
  c      record;
  v_sal  numeric;
  n      integer := 0;
begin
  select * into l from public.liquidaciones where liquidaciones.id = p_id for update;
  if not found then raise exception 'No existe la liquidación %.', p_id; end if;
  if not (public.puede_empresa(l.empresa_id) and public.puede_finanzas()) then
    raise exception 'Restablecer una liquidación lo hacen el Owner o un Administrador.';
  end if;
  if l.anulada_en is null then
    raise exception 'La liquidación % está activa: no hay nada que restablecer.', l.numero;
  end if;
  if l.detalle is null or jsonb_array_length(l.detalle) = 0 then
    raise exception 'La liquidación % se anuló antes de que se guardara su detalle: no se puede restablecer. Liquida las notas de nuevo.', l.numero;
  end if;

  -- Cada nota tiene que seguir ahí, abierta y con el saldo que tenía.
  perform 1 from public.cuentas x where x.id in (select (e->>'cuenta_id')::bigint from jsonb_array_elements(l.detalle) e) for update;
  for d in select * from jsonb_array_elements(l.detalle) loop
    select x.id, x.documento, x.estado, x.empresa_id,
           round(x.monto - coalesce(x.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = x.id), 0), 4) as saldo
      into c from public.cuentas x where x.id = (d->>'cuenta_id')::bigint;
    if c.id is null then
      raise exception 'Una de las notas de % ya no existe: no se puede restablecer.', l.numero;
    end if;
    if c.estado <> 'abierta' then
      raise exception 'La % ya está liquidada en otra liquidación: no se puede restablecer %.', c.documento, l.numero;
    end if;
    if (d->>'saldada')::boolean and abs(c.saldo - (d->>'monto')::numeric) > 0.00005 then
      raise exception 'La % recibió otros abonos desde que se anuló % (su saldo es %, no %): no se puede restablecer.', c.documento, l.numero, c.saldo, d->>'monto';
    end if;
    if not (d->>'saldada')::boolean and (d->>'monto')::numeric >= c.saldo then
      raise exception 'La % ya no tiene saldo para el abono de % de %.', c.documento, d->>'monto', l.numero;
    end if;
  end loop;

  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();
  update public.liquidaciones
     set anulada_en = null, anulada_por = null, anulada_nombre = null, anulada_motivo = null,
         restablecida_en = now(), restablecida_nombre = coalesce(v_nom, 'Sin nombre'), detalle = null
   where liquidaciones.id = p_id;

  for d in select * from jsonb_array_elements(l.detalle) loop
    insert into public.abonos (cuenta_id, fecha, monto, metodo, referencia, imagen_ruta, usuario_id, liquidacion_id)
    values ((d->>'cuenta_id')::bigint, (d->>'fecha')::date, (d->>'monto')::numeric, d->>'metodo', d->>'referencia',
            d->>'imagen_ruta', auth.uid(), p_id);
    if (d->>'saldada')::boolean then
      update public.cuentas x
         set estado = 'liquidada', liquidada_en = now(), liquidada_por = auth.uid(), liquidada_como = 'total',
             liquidada_nota = coalesce(d->>'liquidada_nota', 'Liquidación ' || l.numero)
       where x.id = (d->>'cuenta_id')::bigint;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.restablecer_liquidacion(bigint) from public, anon;
grant execute on function public.restablecer_liquidacion(bigint) to authenticated;

-- ---------------------------------------------------------------- 5. MODIFICAR
create or replace function public.editar_liquidacion(p_id bigint, p_fecha date, p_metodo text, p_referencia text, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  l     public.liquidaciones%rowtype;
  v_nom text;
  hoy   date := (now() at time zone 'America/Caracas')::date;
begin
  select * into l from public.liquidaciones where liquidaciones.id = p_id for update;
  if not found then raise exception 'No existe la liquidación %.', p_id; end if;
  if not (public.puede_empresa(l.empresa_id) and public.puede_finanzas()) then
    raise exception 'Modificar una liquidación lo hacen el Owner o un Administrador.';
  end if;
  if l.anulada_en is not null then
    raise exception 'La liquidación % está anulada: restablécela antes de modificarla.', l.numero;
  end if;
  if p_fecha is null or p_fecha > hoy then
    raise exception 'La fecha del pago no puede ser posterior a hoy.';
  end if;
  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();

  update public.liquidaciones
     set fecha = p_fecha, metodo = nullif(trim(p_metodo), ''), referencia = nullif(trim(p_referencia), ''),
         nota = nullif(trim(p_nota), ''), modificada_en = now(), modificada_nombre = coalesce(v_nom, 'Sin nombre')
   where liquidaciones.id = p_id;

  -- Los abonos de la liquidación cambian con ella (el del restante conserva su marca).
  update public.abonos a
     set fecha = p_fecha, metodo = nullif(trim(p_metodo), ''),
         referencia = concat_ws(' · ', l.numero, case when a.referencia like l.numero || ' · restante%' then 'restante' end,
                                nullif(trim(p_referencia), ''))
   where a.liquidacion_id = p_id;

  -- La nota de las cuentas que cerró, con la nota nueva.
  update public.cuentas c
     set liquidada_nota = 'Liquidación ' || l.numero || coalesce(' · ' || nullif(trim(p_nota), ''), '')
   where c.estado = 'liquidada' and c.liquidada_nota like 'Liquidación ' || l.numero || '%';
end $$;
revoke execute on function public.editar_liquidacion(bigint, date, text, text, text) from public, anon;
grant execute on function public.editar_liquidacion(bigint, date, text, text, text) to authenticated;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: columnas 5, funciones 4, bloquea_eliminar 1.
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'liquidaciones'
    and column_name in ('detalle', 'modificada_en', 'modificada_nombre', 'restablecida_en', 'restablecida_nombre')) as columnas,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('eliminar_cuentas', 'anular_liquidacion', 'restablecer_liquidacion', 'editar_liquidacion')) as funciones,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'eliminar_cuentas' and p.prosrc like '%anula la liquidación primero%'
      and p.prosrc not like '%delete from public.liquidaciones%') as bloquea_eliminar;
