-- 50 · La hora de cada venta, y el diagnóstico del Puente
--
-- Pedido del Owner (2026-11-02): ver en Ventas la hora en que se hizo cada
-- documento en Valery. El agente 1.0.4 la manda (VENTAS.HORA_EMISION); hasta
-- ahora Macedonia guardaba solo la fecha.
--   · movimientos_inventario.hora: la hora del documento. Null = no se sabe
--     (el Excel no la trae): se muestra «—», no se inventa.
--   · _importar_ventas la guarda, y a un renglón que ya estaba y no tenía hora
--     se la pone (solo llena, nunca cambia una hora puesta).
--   · valery_ajustes.horas_rellenas: la primera actualización automática con
--     el agente 1.0.4 pide todo desde el corte, una vez, para ponerle la hora a
--     lo que ya había entrado (lib/valery/ventas-auto.ts).
--   · valery_solicitudes acepta el pedido «diagnostico»: solo conteos por tabla,
--     tipo y estado, para saber dónde guarda Valery cada cosa.
--
-- Nunca escribe en Valery. Se puede correr más de una vez.

begin;

alter table public.movimientos_inventario add column if not exists hora time;
comment on column public.movimientos_inventario.hora is
  'Hora del documento en Valery (desde el agente 1.0.4 del Puente). Null: no se sabe (Excel).';

alter table public.valery_ajustes add column if not exists horas_rellenas boolean not null default false;

-- El check de la migración 47 no tiene nombre propio: se busca por lo que dice.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.valery_solicitudes'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%existencias%'
  loop
    execute format('alter table public.valery_solicitudes drop constraint %I', c);
  end loop;
end $$;
alter table public.valery_solicitudes add constraint valery_solicitudes_tipo_check
  check (tipo in ('ventas', 'cxc', 'cxp', 'existencias', 'estado', 'diagnostico'));

create or replace function public._importar_ventas(
  p_empresa text, p_archivo text, p_hash text, p_renglones jsonb, p_notas jsonb, p_usuario uuid, p_vacio_es_error boolean)
returns table (importacion_id bigint, nuevos integer, repetidos integer, notas_facturadas integer)
language plpgsql security definer set search_path = public as $$
declare
  v_corte  date;
  v_id     bigint;
  v_previa timestamptz;
  v_total  integer;
  v_nuevos integer;
  v_notas  integer := 0;
  v_faltan text;
  v_malo   text;
begin
  select c.desde into v_corte from public.cortes_inventario c where c.empresa_id = p_empresa;
  if v_corte is null then
    raise exception 'Todavía no se pueden importar ventas de esta empresa: primero hay que alinear su existencia con Valery (como se hizo con Sumigases el 23-09-2026).';
  end if;
  -- Lo automático puede traer solo la factura de una nota ya importada: ningún
  -- renglón nuevo, pero hay que marcar la nota como facturada.
  if jsonb_typeof(p_renglones) is distinct from 'array' or (jsonb_array_length(p_renglones) = 0 and p_vacio_es_error) then
    raise exception 'El archivo no trae renglones para importar.';
  end if;

  -- Un archivo a la vez por empresa: dos importaciones al mismo tiempo podrían
  -- usar la misma nota para dos facturas.
  perform pg_advisory_xact_lock(hashtext('ventas_valery:' || p_empresa));

  select i.created_at into v_previa from public.importaciones i where i.empresa_id = p_empresa and i.hash_archivo = p_hash;
  if v_previa is not null then
    raise exception 'Este archivo ya se importó el %.', to_char(v_previa at time zone 'America/Caracas', 'DD-MM-YYYY HH24:MI');
  end if;

  create temporary table _r on commit drop as
  select * from jsonb_to_recordset(p_renglones) as x(
    renglon text, fecha date, hora time, direccion text, tipo text, documento text, cliente text,
    codigo text, nombre text, cantidad numeric, monto_usd numeric, facturada_con text);

  select format('%s %s (fila con %s)', r.tipo, coalesce(r.documento, '?'), r.codigo) into v_malo from _r r
   where r.renglon is null or r.fecha is null or r.codigo is null or r.cantidad is null or r.cantidad <= 0
      or r.tipo not in ('FAC', 'NET', 'DEV')
      or r.direccion is distinct from case when r.tipo = 'DEV' then 'entrada' else 'salida' end
   limit 1;
  if v_malo is not null then raise exception 'Hay un renglón incompleto o mal armado: %.', v_malo; end if;

  select to_char(min(r.fecha), 'DD-MM-YYYY') into v_malo from _r r where r.fecha < v_corte;
  if v_malo is not null then
    raise exception 'El archivo trae ventas del %, antes del corte (%). Lo anterior al corte ya está en la existencia.', v_malo, to_char(v_corte, 'DD-MM-YYYY');
  end if;

  select string_agg(distinct r.codigo, ', ') into v_faltan
    from (select r.codigo from _r r
           where not exists (select 1 from public.productos p where p.empresa_id = p_empresa and p.codigo = r.codigo)
           limit 20) r;
  if v_faltan is not null then
    raise exception 'Estos códigos no están en el catálogo: %. Agrégalos (o actualiza el catálogo desde Valery) y vuelve a importar.', v_faltan;
  end if;

  select count(*) into v_total from _r;
  insert into public.importaciones (empresa_id, tipo, archivo, hash_archivo, filas, periodo_desde, periodo_hasta, subido_por)
  select p_empresa, 'ventas', p_archivo, p_hash, 0, min(fecha), max(fecha), p_usuario from _r
  returning id into v_id;

  insert into public.movimientos_inventario
    (empresa_id, fecha, hora, direccion, origen, codigo, nombre, cantidad, documento, importacion_id, usuario_id,
     renglon, tipo_doc, cliente, monto_usd, facturada_con)
  select p_empresa, r.fecha, r.hora, r.direccion::public.direccion_mov, 'venta', r.codigo, coalesce(nullif(r.nombre, ''), r.codigo), r.cantidad,
         r.documento, v_id, p_usuario, r.renglon, r.tipo, r.cliente, r.monto_usd, r.facturada_con
    from _r r
  on conflict (empresa_id, renglon) where renglon is not null do nothing;
  get diagnostics v_nuevos = row_count;

  -- La hora de lo que ya estaba (entró por Excel o antes del agente 1.0.4):
  -- el mismo renglón trae ahora su hora. Solo se llena, nunca se cambia.
  update public.movimientos_inventario m set hora = r.hora
    from _r r
   where m.empresa_id = p_empresa and m.renglon = r.renglon and m.hora is null and r.hora is not null;

  -- Notas de importaciones anteriores que esta importación factura.
  if jsonb_typeof(p_notas) = 'array' and jsonb_array_length(p_notas) > 0 then
    update public.movimientos_inventario m
       set facturada_con = n.factura, facturada_en = v_id
      from jsonb_to_recordset(p_notas) as n(renglon text, factura text)
     where m.empresa_id = p_empresa and m.renglon = n.renglon and m.tipo_doc = 'NET'
       and (m.facturada_con is null or m.facturada_con = n.factura);
    get diagnostics v_notas = row_count;
  end if;

  if v_nuevos = 0 and v_notas = 0 then
    if p_vacio_es_error then
      raise exception 'Todo lo de este archivo ya estaba importado: no hay nada nuevo.';
    end if;
    -- Una actualización automática sin nada nuevo no deja una importación vacía.
    delete from public.importaciones where id = v_id;
    return query select null::bigint, 0, v_total, 0;
    return;
  end if;
  update public.importaciones set filas = v_nuevos where id = v_id;
  return query select v_id, v_nuevos, v_total - v_nuevos, v_notas;
end $$;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: hora 1, horas_rellenas 1, diagnostico 1, importador 1, solo_servidor 1.
select
  (select count(*) from information_schema.columns where table_schema = 'public'
    and table_name = 'movimientos_inventario' and column_name = 'hora') as hora,
  (select count(*) from information_schema.columns where table_schema = 'public'
    and table_name = 'valery_ajustes' and column_name = 'horas_rellenas') as horas_rellenas,
  -- Uno solo, y que acepte el diagnóstico.
  (select case when count(*) = 1 and bool_and(pg_get_constraintdef(oid) like '%diagnostico%') then 1 else 0 end
     from pg_constraint where conrelid = 'public.valery_solicitudes'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%existencias%') as diagnostico,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_importar_ventas' and p.prosrc like '%m.hora is null%') as importador,
  (select case when not has_function_privilege('authenticated', 'public._importar_ventas(text, text, text, jsonb, jsonb, uuid, boolean)', 'execute')
               then 1 else 0 end) as solo_servidor;
