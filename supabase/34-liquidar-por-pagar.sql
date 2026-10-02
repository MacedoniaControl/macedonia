-- 34 · Liquidar también las cuentas por pagar
--
-- La misma liquidación de la migración 33, ahora para los proveedores: el
-- Owner o un Administrador elige varias cuentas de UN proveedor, registra el
-- pago una vez (con su comprobante) y cada cuenta recibe un abono por todo su
-- saldo (monto − IVA retenido − lo ya abonado) y queda liquidada. Queda el
-- registro LQ-AAAA-NNNNNN (el mismo correlativo que las de cobrar) y se anula
-- igual que una de cobrar.
--
-- liquidar_cuentas gana un último parámetro p_tipo ('cobrar' por defecto, así
-- que lo que ya la llama sigue igual). Se borra la versión de 7 parámetros
-- para que no queden dos funciones con el mismo nombre.
--
-- Se puede correr más de una vez.

drop function if exists public.liquidar_cuentas(text, bigint[], date, text, text, text, text);

create or replace function public.liquidar_cuentas(
  p_empresa text, p_ids bigint[], p_fecha date, p_metodo text, p_referencia text, p_nota text, p_imagen_ruta text,
  p_tipo text default 'cobrar')
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
    raise exception 'Elige al menos una cuenta.';
  end if;
  if p_fecha is null or p_fecha > hoy then
    raise exception 'La fecha del pago no puede ser posterior a hoy.';
  end if;

  -- Las cuentas, bloqueadas: dos personas no pueden liquidar la misma a la vez.
  perform 1 from public.cuentas c where c.id = any (p_ids) for update;

  select count(*) into v_n from public.cuentas c where c.id = any (p_ids);
  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguna de las cuentas ya no existe.';
  end if;
  if exists (select 1 from public.cuentas c where c.id = any (p_ids) and (c.empresa_id <> p_empresa or c.tipo::text <> p_tipo)) then
    raise exception 'Todas las cuentas tienen que ser por % de esta empresa.', p_tipo;
  end if;
  select string_agg(c.documento, ', ') into v_cli from public.cuentas c where c.id = any (p_ids) and c.estado <> 'abierta';
  if v_cli is not null then
    raise exception 'Ya están liquidadas: %.', v_cli;
  end if;
  if (select count(distinct upper(trim(c.contraparte))) from public.cuentas c where c.id = any (p_ids)) > 1 then
    raise exception 'Las cuentas son de %s distintos: una liquidación es de un solo %.',
      case when p_tipo = 'pagar' then 'proveedore' else 'cliente' end, v_quien;
  end if;
  select min(c.contraparte) into v_cli from public.cuentas c where c.id = any (p_ids);

  -- Lo que falta de cada una: monto − IVA retenido − lo ya abonado.
  create temporary table _l on commit drop as
  select c.id, c.documento,
         round(c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0), 2) as saldo
    from public.cuentas c where c.id = any (p_ids);
  select string_agg(l.documento, ', ') into v_num from _l l where l.saldo <= 0;
  if v_num is not null then
    raise exception 'No tienen saldo pendiente: %. Quítalas de la selección.', v_num;
  end if;
  select sum(l.saldo) into v_total from _l l;

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

  return query select v_id, v_num, v_total, v_n;
end $$;
revoke execute on function public.liquidar_cuentas(text, bigint[], date, text, text, text, text, text) from public, anon;
grant execute on function public.liquidar_cuentas(text, bigint[], date, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: funciones 1, parametros 8.
select
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'liquidar_cuentas') as funciones,
  (select max(p.pronargs) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'liquidar_cuentas') as parametros;
