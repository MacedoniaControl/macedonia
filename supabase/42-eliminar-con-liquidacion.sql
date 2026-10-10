-- 42 · Eliminar cuentas que están en una liquidación
--
-- La migración 38 no dejaba eliminar una cuenta que estuviera en una
-- liquidación vigente («Anúlala primero»). Pero si se eliminan TODAS las
-- cuentas de esa liquidación, la liquidación se queda sin nada que liquidar:
-- se borra también, sin dejar registro, igual que el resto de «Eliminar»
-- (pedido del usuario, 10-10-2026: JOSE ARAYA, LQ-2026-000010).
--
--   · Si la liquidación también pagó cuentas que NO se están eliminando, sigue
--     sin dejarse: se dice cuáles, para no dejar un pago a medias.
--   · La foto del comprobante de la liquidación se borra del bucket con ella.
--
-- Todo lo demás de la 38 queda igual. Se puede correr más de una vez.

create or replace function public.eliminar_cuentas(p_empresa text, p_ids bigint[])
returns table (cuentas integer, rutas text[])
language plpgsql security definer set search_path = public as $$
declare
  v_n     integer;
  v_lq    text;
  v_lqs   bigint[];
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

  -- Las liquidaciones vigentes de estas cuentas.
  select array_agg(distinct a.liquidacion_id) into v_lqs
    from public.abonos a
    join public.liquidaciones l on l.id = a.liquidacion_id and l.anulada_en is null
   where a.cuenta_id = any (p_ids);

  -- Si alguna también pagó cuentas que se quedan, no se elimina: se dice cuáles.
  select string_agg(distinct l.numero || ' (' || c.documento || ')', ', ') into v_lq
    from public.abonos a
    join public.liquidaciones l on l.id = a.liquidacion_id
    join public.cuentas c on c.id = a.cuenta_id
   where a.liquidacion_id = any (coalesce(v_lqs, '{}')) and not (a.cuenta_id = any (p_ids));
  if v_lq is not null then
    raise exception 'Esa liquidación también pagó otras cuentas: %. Márcalas también o anula la liquidación primero.', v_lq;
  end if;

  -- Las fotos de la cuenta, de sus abonos y de las liquidaciones que se van con ellas.
  select array_agg(distinct r) into v_rutas from (
    select c.imagen_ruta r from public.cuentas c where c.id = any (p_ids) and c.imagen_ruta is not null
    union
    select a.imagen_ruta from public.abonos a where a.cuenta_id = any (p_ids) and a.imagen_ruta is not null
    union
    select l.imagen_ruta from public.liquidaciones l where l.id = any (coalesce(v_lqs, '{}')) and l.imagen_ruta is not null
  ) f;

  delete from public.abonos a where a.cuenta_id = any (p_ids);
  delete from public.liquidaciones l where l.id = any (coalesce(v_lqs, '{}'));
  delete from public.cuentas c where c.id = any (p_ids);
  get diagnostics v_n = row_count;
  return query select v_n, coalesce(v_rutas, '{}'::text[]);
end $$;
revoke execute on function public.eliminar_cuentas(text, bigint[]) from public, anon;
grant execute on function public.eliminar_cuentas(text, bigint[]) to authenticated;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: funcion 1, borra_liquidacion 1.
select
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'eliminar_cuentas') as funcion,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'eliminar_cuentas' and p.prosrc like '%delete from public.liquidaciones%') as borra_liquidacion;
