-- 49 · Lo automático agrega al catálogo los productos nuevos de Valery
--
-- Pedido del Owner (2026-11-02). La primera actualización automática que leyó
-- la base correcta se frenó entera por cinco productos que existen en Valery y
-- no en el catálogo de Macedonia (CBL-0737, LAM-36W…). Cada producto nuevo que
-- se venda en Valery la volvería a frenar.
--
-- Ahora importar_ventas_puente, antes de importar, da de alta en el catálogo
-- los códigos que trae la venta y no existen:
--   · con el código y el nombre tal como vienen de Valery; precio y costo en
--     CERO (la venta no los trae: no se inventan) y sin departamento;
--   · marcados en `creado_desde` con el pedido que los trajo;
--   · NUNCA si en el catálogo hay el mismo código con otras mayúsculas: en
--     Valery «6X8AT» y «6x8AT» son productos distintos y no se adivina cuál es
--     cuál. Ahí la actualización se frena con un mensaje que lo dice.
-- El Excel (importar_ventas_valery) sigue igual: un código desconocido frena.
--
-- Nunca escribe en Valery. Se puede correr más de una vez.

begin;

alter table public.productos add column if not exists creado_desde text;
comment on column public.productos.creado_desde is
  'Si lo dio de alta el Puente Valery: el pedido que lo trajo (puente-valery-<id>). Precio y costo quedan en 0 hasta cargarlos.';

-- Cambia lo que devuelve (agrega productos_creados): hay que borrarla antes.
drop function if exists public.importar_ventas_puente(bigint, jsonb, jsonb);
create function public.importar_ventas_puente(p_solicitud bigint, p_renglones jsonb, p_notas jsonb default '[]'::jsonb)
returns table (importacion_id bigint, nuevos integer, repetidos integer, notas_facturadas integer, productos_creados text[])
language plpgsql security definer set search_path = public as $$
declare
  s public.valery_solicitudes%rowtype;
  r record;
  v_dudosos text;
  v_creados text[] := '{}';
begin
  select * into s from public.valery_solicitudes where id = p_solicitud for update;
  if not found then raise exception 'No existe la solicitud %.', p_solicitud; end if;
  if not s.automatica or s.tipo <> 'ventas' then raise exception 'La solicitud % no es una actualización automática de ventas.', p_solicitud; end if;
  if s.estado <> 'lista' then raise exception 'La solicitud % no está lista (está %).', p_solicitud, s.estado; end if;

  if jsonb_typeof(p_renglones) = 'array' and jsonb_array_length(p_renglones) > 0 then
    -- Códigos que no están tal cual, pero sí con otras mayúsculas: no se adivina.
    select string_agg(format('%s (en el catálogo: %s)', x.codigo, x.parecido), ', ') into v_dudosos
      from (select distinct j.codigo,
                   (select string_agg(p.codigo, ' / ') from public.productos p
                     where p.empresa_id = s.empresa_id and lower(p.codigo) = lower(j.codigo)) as parecido
              from jsonb_to_recordset(p_renglones) as j(codigo text)
             where j.codigo is not null
               and not exists (select 1 from public.productos p where p.empresa_id = s.empresa_id and p.codigo = j.codigo)
               and exists (select 1 from public.productos p where p.empresa_id = s.empresa_id and lower(p.codigo) = lower(j.codigo))
             limit 20) x;
    if v_dudosos is not null then
      raise exception 'Estos códigos de Valery se parecen a otros del catálogo con distintas mayúsculas: %. En Valery son productos distintos: revisa cuál es cuál; no se dan de alta solos.', v_dudosos;
    end if;

    -- Los nuevos de verdad: alta con lo que trae la venta, nada inventado.
    with altas as (
      insert into public.productos (empresa_id, codigo, nombre, creado_desde)
      select distinct on (j.codigo) s.empresa_id, j.codigo, coalesce(nullif(trim(j.nombre), ''), j.codigo), 'puente-valery-' || s.id
        from jsonb_to_recordset(p_renglones) as j(codigo text, nombre text)
       where j.codigo is not null and trim(j.codigo) <> ''
         and not exists (select 1 from public.productos p where p.empresa_id = s.empresa_id and p.codigo = j.codigo)
       order by j.codigo
      on conflict (empresa_id, codigo) do nothing
      returning productos.codigo)
    select coalesce(array_agg(a.codigo order by a.codigo), '{}') into v_creados from altas a;
  end if;

  select * into r from public._importar_ventas(
    s.empresa_id,
    format('Puente Valery · automática %s a %s', s.parametros ->> 'desde', s.parametros ->> 'hasta'),
    'puente-valery-' || s.id, p_renglones, p_notas, s.creado_por, false);
  update public.valery_solicitudes set estado = 'aplicada', aplicado_en = now(), importacion_id = r.importacion_id where id = s.id;
  return query select r.importacion_id, r.nuevos, r.repetidos, r.notas_facturadas, v_creados;
end $$;
revoke execute on function public.importar_ventas_puente(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.importar_ventas_puente(bigint, jsonb, jsonb) to service_role;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: columna 1, funcion 1, solo_servidor 1.
select
  (select count(*) from information_schema.columns where table_schema = 'public'
    and table_name = 'productos' and column_name = 'creado_desde') as columna,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'importar_ventas_puente'
      and pg_get_function_result(p.oid) like '%productos_creados%') as funcion,
  (select case when has_function_privilege('service_role', 'public.importar_ventas_puente(bigint, jsonb, jsonb)', 'execute')
                and not has_function_privilege('authenticated', 'public.importar_ventas_puente(bigint, jsonb, jsonb)', 'execute')
               then 1 else 0 end) as solo_servidor;
