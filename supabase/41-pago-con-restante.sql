-- 41 · Un pago salda varias notas y abona el restante a otra
--
-- Pedido del usuario (07-10-2026): «si en una deuda de 500 tengo 5 notas de
-- 100 y abono 350, debe liquidarme 3 notas de 100 y abonar 50 en otra, para
-- hacer el saldo de 350 y quedar restante 150». Por defecto el restante va a
-- la nota de mayor saldo pendiente; la persona puede elegir otra.
--
--   1. liquidar_cuentas recibe, además de las notas que se saldan, la nota y el
--      monto del restante. Ese abono parcial entra en la MISMA liquidación (es
--      el mismo pago); la nota sigue abierta con su saldo menor. Anular la
--      liquidación borra también ese abono.
--   2. La regla de la migración 40 (una nota de entrega se da por pagada solo
--      liquidándola) también rige en Cuentas por Pagar.
--   3. Los dos pagos del estado de cuenta viejo que se habían cargado de más en
--      una sola nota (JOSE ARAYA y ARUPON) se reparten con la misma regla: se
--      saldan las notas que alcanza el pago, de la más vieja a la más nueva, y
--      lo que sobra va a la de mayor saldo.
--
-- Se puede correr más de una vez.

begin;

-- ---------------------------------------------------------------- 1. LIQUIDAR CON RESTANTE
drop function if exists public.liquidar_cuentas(text, bigint[], date, text, text, text, text, text);

create or replace function public.liquidar_cuentas(
  p_empresa text, p_ids bigint[], p_fecha date, p_metodo text, p_referencia text, p_nota text, p_imagen_ruta text,
  p_tipo text default 'cobrar', p_abono_cuenta bigint default null, p_abono_monto numeric default null)
returns table (id bigint, numero text, total numeric, cuentas integer)
language plpgsql security definer set search_path = public as $$
declare
  hoy      date := (now() at time zone 'America/Caracas')::date;
  v_nom    text;
  v_id     bigint;
  v_num    text;
  v_total  numeric := 0;
  v_cli    text;
  v_n      integer;
  v_ab     record;
  v_pend   numeric;
  r        record;
  v_quien  text := case when p_tipo = 'pagar' then 'proveedor' else 'cliente' end;
begin
  if p_tipo is null or p_tipo not in ('cobrar', 'pagar') then
    raise exception 'Tipo de cuenta inválido: %.', p_tipo;
  end if;
  if not (public.puede_empresa(p_empresa) and public.puede_finanzas()
          and public.puede(case when p_tipo = 'pagar' then 'payables' else 'receivables' end)) then
    raise exception 'Liquidar cuentas lo hacen el Owner o un Administrador.';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Elige al menos una cuenta para saldar.';
  end if;
  if p_fecha is null or p_fecha > hoy then
    raise exception 'La fecha del pago no puede ser posterior a hoy.';
  end if;
  if (p_abono_cuenta is null) <> (p_abono_monto is null) then
    raise exception 'El restante necesita la nota y el monto.';
  end if;
  if p_abono_monto is not null and p_abono_monto <= 0 then
    raise exception 'El restante tiene que ser mayor que cero.';
  end if;
  if p_abono_cuenta = any (p_ids) then
    raise exception 'La nota que recibe el restante no puede ser una de las que se saldan.';
  end if;

  -- Las cuentas, bloqueadas: dos personas no pueden liquidar la misma a la vez.
  perform 1 from public.cuentas c where c.id = any (p_ids) or c.id = p_abono_cuenta for update;

  select count(*) into v_n from public.cuentas c where c.id = any (p_ids);
  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguna de las cuentas ya no existe.';
  end if;
  if exists (select 1 from public.cuentas c where (c.id = any (p_ids) or c.id = p_abono_cuenta)
               and (c.empresa_id <> p_empresa or c.tipo::text <> p_tipo)) then
    raise exception 'Todas las cuentas tienen que ser por % de esta empresa.', p_tipo;
  end if;
  select string_agg(c.documento, ', ') into v_cli from public.cuentas c
   where (c.id = any (p_ids) or c.id = p_abono_cuenta) and c.estado <> 'abierta';
  if v_cli is not null then
    raise exception 'Ya están liquidadas: %.', v_cli;
  end if;
  if (select count(distinct upper(trim(c.contraparte))) from public.cuentas c where c.id = any (p_ids) or c.id = p_abono_cuenta) > 1 then
    raise exception 'Las cuentas son de %s distintos: una liquidación es de un solo %.',
      case when p_tipo = 'pagar' then 'proveedore' else 'cliente' end, v_quien;
  end if;
  select min(c.contraparte) into v_cli from public.cuentas c where c.id = any (p_ids);

  -- Lo que falta de cada una: monto − IVA retenido − lo ya abonado.
  create temporary table _l on commit drop as
  select c.id, c.documento,
         round(c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0), 4) as saldo
    from public.cuentas c where c.id = any (p_ids);
  select string_agg(l.documento, ', ') into v_num from _l l where l.saldo <= 0;
  if v_num is not null then
    raise exception 'No tienen saldo pendiente: %. Quítalas de la selección.', v_num;
  end if;
  select sum(l.saldo) into v_total from _l l;

  -- El restante: menos que lo que falta de esa nota (si alcanza, se salda).
  if p_abono_cuenta is not null then
    select c.documento, round(c.monto - coalesce(c.iva_retenido, 0)
             - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0), 4) as saldo
      into v_ab from public.cuentas c where c.id = p_abono_cuenta;
    if v_ab is null then raise exception 'La nota del restante ya no existe.'; end if;
    if p_abono_monto >= v_ab.saldo then
      raise exception 'El restante (%) alcanza para saldar la %: márcala para saldar.', p_abono_monto, v_ab.documento;
    end if;
    v_total := v_total + p_abono_monto;
  end if;

  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();
  v_num := public.numero_liquidacion(p_empresa);
  insert into public.liquidaciones (empresa_id, tipo, numero, contraparte, fecha, total, cuentas, metodo, referencia, nota, imagen_ruta, creado_por, creado_nombre)
  values (p_empresa, p_tipo, v_num, v_cli, p_fecha, v_total, v_n, nullif(trim(p_metodo), ''), nullif(trim(p_referencia), ''),
          nullif(trim(p_nota), ''), nullif(trim(p_imagen_ruta), ''), auth.uid(), coalesce(v_nom, 'Sin nombre'))
  returning liquidaciones.id into v_id;

  for r in select * from _l loop
    insert into public.abonos (cuenta_id, fecha, monto, metodo, referencia, imagen_ruta, usuario_id, liquidacion_id)
    values (r.id, p_fecha, r.saldo, nullif(trim(p_metodo), ''),
            concat_ws(' · ', v_num, nullif(trim(p_referencia), '')), nullif(trim(p_imagen_ruta), ''), auth.uid(), v_id);
    update public.cuentas c
       set estado = 'liquidada', liquidada_en = now(), liquidada_por = auth.uid(), liquidada_como = 'total',
           liquidada_nota = 'Liquidación ' || v_num || coalesce(' · ' || nullif(trim(p_nota), ''), '')
     where c.id = r.id;
  end loop;

  if p_abono_cuenta is not null then
    insert into public.abonos (cuenta_id, fecha, monto, metodo, referencia, imagen_ruta, usuario_id, liquidacion_id)
    values (p_abono_cuenta, p_fecha, p_abono_monto, nullif(trim(p_metodo), ''),
            concat_ws(' · ', v_num, 'restante', nullif(trim(p_referencia), '')), nullif(trim(p_imagen_ruta), ''), auth.uid(), v_id);
  end if;

  return query select v_id, v_num, v_total, v_n;
end $$;
revoke execute on function public.liquidar_cuentas(text, bigint[], date, text, text, text, text, text, bigint, numeric) from public, anon;
grant execute on function public.liquidar_cuentas(text, bigint[], date, text, text, text, text, text, bigint, numeric) to authenticated;

-- ---------------------------------------------------------------- 2. LA REGLA TAMBIÉN EN POR PAGAR
create or replace function public.ne_abono_solo_liquidando()
returns trigger
language plpgsql as $$
declare
  privilegiado boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
  v       record;
  abonado numeric;
begin
  if privilegiado or new.liquidacion_id is not null then return new; end if;
  select c.tipo, c.clase, c.documento, c.monto, coalesce(c.iva_retenido, 0) as ret into v
    from public.cuentas c where c.id = new.cuenta_id;
  if v.clase = 'nota_entrega' then
    select coalesce(sum(a.monto), 0) into abonado from public.abonos a where a.cuenta_id = new.cuenta_id;
    if abonado + new.monto >= v.monto - v.ret - 0.00005 then
      raise exception 'Ese abono paga completa la %. Para darla por pagada, liquídala con «Liquidar»: queda en una liquidación.', v.documento;
    end if;
  end if;
  return new;
end $$;

create or replace function public.ne_pagada_solo_liquidando()
returns trigger
language plpgsql as $$
declare
  privilegiado boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if privilegiado then return new; end if;
  if new.clase = 'nota_entrega'
     and new.estado = 'liquidada' and old.estado is distinct from 'liquidada'
     and not exists (select 1 from public.abonos a
                       join public.liquidaciones l on l.id = a.liquidacion_id and l.anulada_en is null
                      where a.cuenta_id = new.id) then
    raise exception 'La % solo se da por pagada liquidándola (botón «Liquidar»).', new.documento;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 3. LOS PAGOS CARGADOS DE MÁS
do $$
declare
  s        record;
  n        record;
  v_id     bigint;
  v_num    text;
  v_queda  numeric;
  v_salda  integer;
  v_dest   bigint;
begin
  -- Notas de entrega con saldo negativo y su pago (abonos sin liquidación).
  for s in
    select c.id, c.empresa_id, c.tipo, c.contraparte,
           (select sum(a.monto) from public.abonos a where a.cuenta_id = c.id and a.liquidacion_id is null) as pago,
           (select min(a.fecha) from public.abonos a where a.cuenta_id = c.id and a.liquidacion_id is null) as fecha,
           (select min(a.referencia) from public.abonos a where a.cuenta_id = c.id and a.liquidacion_id is null) as referencia
      from public.cuentas c
     where c.clase = 'nota_entrega' and c.estado = 'abierta'
       and c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0) < -0.00005
       and not exists (select 1 from public.abonos a where a.cuenta_id = c.id and a.liquidacion_id is not null)
  loop
    -- Se rehace el pago: fuera el abono de más, y a repartirlo.
    delete from public.abonos a where a.cuenta_id = s.id and a.liquidacion_id is null;
    v_num := public.numero_liquidacion(s.empresa_id);
    insert into public.liquidaciones (empresa_id, tipo, numero, contraparte, fecha, total, cuentas, metodo, referencia, nota, creado_por, creado_nombre)
    values (s.empresa_id, s.tipo::text, v_num, s.contraparte, s.fecha, s.pago, 0, null, null,
            'Pago del estado de cuenta viejo, repartido entre sus notas: ' || coalesce(s.referencia, ''), null, 'Sistema')
    returning id into v_id;

    -- Se saldan de la más vieja a la más nueva mientras alcance.
    v_queda := s.pago; v_salda := 0;
    for n in
      select c.id, c.documento,
             c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0) as saldo
        from public.cuentas c
       where c.empresa_id = s.empresa_id and c.tipo = s.tipo and c.estado = 'abierta' and c.clase = 'nota_entrega'
         and upper(trim(c.contraparte)) = upper(trim(s.contraparte))
       order by c.vence, c.documento
    loop
      exit when n.saldo > v_queda + 0.00005;
      continue when n.saldo <= 0;
      insert into public.abonos (cuenta_id, fecha, monto, referencia, liquidacion_id)
      values (n.id, s.fecha, n.saldo, v_num, v_id);
      update public.cuentas c set estado = 'liquidada', liquidada_en = now(), liquidada_como = 'total',
             liquidada_nota = 'Liquidación ' || v_num where c.id = n.id;
      v_queda := v_queda - n.saldo; v_salda := v_salda + 1;
    end loop;

    -- Lo que sobra, a la de mayor saldo.
    if v_queda > 0.00005 then
      select c.id into v_dest
        from public.cuentas c
       where c.empresa_id = s.empresa_id and c.tipo = s.tipo and c.estado = 'abierta' and c.clase = 'nota_entrega'
         and upper(trim(c.contraparte)) = upper(trim(s.contraparte))
         and c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0) > v_queda
       order by c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0) desc, c.vence
       limit 1;
      if v_dest is null then
        raise exception 'El pago de % no cabe en sus notas abiertas.', s.contraparte;
      end if;
      insert into public.abonos (cuenta_id, fecha, monto, referencia, liquidacion_id)
      values (v_dest, s.fecha, v_queda, v_num || ' · restante', v_id);
    end if;
    update public.liquidaciones set cuentas = v_salda where liquidaciones.id = v_id;
  end loop;

  -- Por pagar: las notas de entrega ya pagadas sin liquidación reciben la suya
  -- (lo mismo que hizo la 40 en por cobrar).
  for s in
    select p.empresa_id, min(p.contraparte) as contraparte, a.fecha, coalesce(a.metodo, '') as metodo, coalesce(a.referencia, '') as referencia,
           array_agg(a.id) as abonos, array_agg(distinct p.id) as cuentas, sum(a.monto) as total
      from public.cuentas p join public.abonos a on a.cuenta_id = p.id and a.liquidacion_id is null
     where p.tipo = 'pagar' and p.clase = 'nota_entrega'
       and abs(p.monto - coalesce(p.iva_retenido, 0) - coalesce((select sum(x.monto) from public.abonos x where x.cuenta_id = p.id), 0)) < 0.00005
       and not exists (select 1 from public.abonos x join public.liquidaciones l on l.id = x.liquidacion_id and l.anulada_en is null where x.cuenta_id = p.id)
     group by p.empresa_id, upper(trim(p.contraparte)), a.fecha, coalesce(a.metodo, ''), coalesce(a.referencia, '')
  loop
    v_num := public.numero_liquidacion(s.empresa_id);
    insert into public.liquidaciones (empresa_id, tipo, numero, contraparte, fecha, total, cuentas, metodo, referencia, nota, creado_por, creado_nombre)
    values (s.empresa_id, 'pagar', v_num, s.contraparte, s.fecha, s.total, cardinality(s.cuentas), nullif(s.metodo, ''), nullif(s.referencia, ''),
            'Pago registrado antes de las liquidaciones', null, 'Sistema')
    returning id into v_id;
    update public.abonos a set liquidacion_id = v_id where a.id = any (s.abonos);
    update public.cuentas c set estado = 'liquidada', liquidada_en = coalesce(c.liquidada_en, now()), liquidada_como = 'total',
           liquidada_nota = 'Liquidación ' || v_num where c.id = any (s.cuentas);
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: parametros 10, sobrepagadas 0, pagadas_sin_lq 0.
select
  (select max(p.pronargs) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'liquidar_cuentas') as parametros,
  (select count(*) from public.cuentas c
    where c.clase = 'nota_entrega'
      and c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0) < -0.00005) as sobrepagadas,
  (select count(*) from public.cuentas c
    where c.clase = 'nota_entrega'
      and (c.estado = 'liquidada'
           or abs(c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0)) < 0.00005)
      and not exists (select 1 from public.abonos a join public.liquidaciones l on l.id = a.liquidacion_id and l.anulada_en is null
                       where a.cuenta_id = c.id)) as pagadas_sin_lq;
