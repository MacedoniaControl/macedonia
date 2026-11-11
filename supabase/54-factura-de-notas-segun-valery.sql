-- 54 · La factura de notas, según Valery
--
-- Comprobando el agente 1.0.6 (2026-11-05) quedaban 511 productos distintos de
-- Valery. Uno de los motivos: facturas que Macedonia descontaba y Valery no
-- (la FAC 1596 descontó 200 BRGXL; Valery no se movió). Macedonia adivinaba
-- qué factura cobra una nota de entrega comparando cliente, código, cantidad
-- y monto; cuando no la reconocía, la factura descontaba otra vez.
--
-- Valery lo dice: VENTAS_ESTADOS.EXIST_ACTUAL_ACTUALIZADA (si el documento se
-- aplicó a la existencia) y VENTAS_DETALLES_REL_CANT (qué renglón de la
-- factura viene de qué nota). En la copia de marzo, los 1.807 renglones de
-- factura que Valery no aplicó están todos enlazados a su nota. El agente
-- 1.0.7 lo manda y Macedonia deja de adivinar.
--
--   · _importar_ventas: con «reclasifica» (solo desde el agente 1.0.7), la
--     factura que viene de una nota sale del kardex y queda en
--     ventas_facturas_notas (sigue siendo venta); la que Valery descontó y
--     estaba como factura de notas vuelve al kardex; cada nota toma la
--     factura que dice Valery.
--   · valery_ajustes.notas_segun_valery: la primera actualización con un
--     agente 1.0.7 pide todo desde el corte, una vez.
--
-- Nunca escribe en Valery. Se puede correr más de una vez.

begin;

alter table public.valery_ajustes add column if not exists notas_segun_valery boolean not null default false;

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
  v_facturas integer := 0;
  v_faltan text;
  v_malo   text;
  v_reacomodo integer := 0;
  v_n      integer;
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
    codigo text, nombre text, cantidad numeric, monto_usd numeric, facturada_con text, de_notas boolean, devuelve text, corrige_cantidad boolean, reclasifica boolean);
  update _r set de_notas = false where de_notas is null;
  update _r set corrige_cantidad = false where corrige_cantidad is null;
  update _r set reclasifica = false where reclasifica is null;

  select format('%s %s (fila con %s)', r.tipo, coalesce(r.documento, '?'), r.codigo) into v_malo from _r r
   where r.renglon is null or r.fecha is null or r.codigo is null or r.cantidad is null or r.cantidad <= 0
      or r.tipo not in ('FAC', 'NET', 'DEV', 'RCM', 'FCM', 'DCM', 'CRG', 'DSC', 'AJS')
      -- Lo que entra y lo que sale, por tipo. El ajuste puede ir hacia los dos lados.
      or r.direccion is distinct from case when r.tipo in ('DEV', 'RCM', 'FCM', 'CRG') then 'entrada'
                                           when r.tipo in ('FAC', 'NET', 'DCM', 'DSC') then 'salida'
                                           when r.direccion in ('entrada', 'salida') then r.direccion end
      -- Las compras no traen monto: el costo de compra no se guarda aquí.
      or (r.tipo not in ('FAC', 'NET', 'DEV') and (r.monto_usd is not null or r.facturada_con is not null or r.corrige_cantidad))
      -- La factura de una nota es solo eso: una FAC.
      or (r.de_notas and r.tipo <> 'FAC')
      -- Solo una factura o una nota se reacomodan según Valery.
      or (r.reclasifica and r.tipo not in ('FAC', 'NET'))
      -- Solo una devolución devuelve algo, y es una nota o una factura.
      or (r.devuelve is not null and (r.tipo <> 'DEV' or r.devuelve !~ '^(NET|FAC) [0-9]+$'))
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
     renglon, tipo_doc, cliente, monto_usd, facturada_con, devuelve)
  select p_empresa, r.fecha, r.hora, r.direccion::public.direccion_mov,
         (case when r.tipo in ('FAC', 'NET', 'DEV') then 'venta' when r.tipo in ('RCM', 'FCM', 'DCM') then 'compra' else 'ajuste' end)::public.origen_mov,
         r.codigo, coalesce(nullif(r.nombre, ''), r.codigo), r.cantidad,
         r.documento, v_id, p_usuario, r.renglon, r.tipo, r.cliente, r.monto_usd, r.facturada_con, r.devuelve
    from _r r
   where not r.de_notas
  on conflict (empresa_id, renglon) where renglon is not null do nothing;
  get diagnostics v_nuevos = row_count;

  -- Las facturas de notas: son la venta, pero la mercancía ya salió con la
  -- nota. Van aparte y no tocan la existencia.
  insert into public.ventas_facturas_notas
    (empresa_id, renglon, fecha, hora, documento, cliente, codigo, nombre, cantidad, monto_usd, importacion_id)
  select p_empresa, r.renglon, r.fecha, r.hora, r.documento, r.cliente, r.codigo, coalesce(nullif(r.nombre, ''), r.codigo),
         r.cantidad, r.monto_usd, v_id
    from _r r
   where r.de_notas
  on conflict (empresa_id, renglon) do nothing;
  get diagnostics v_facturas = row_count;
  v_nuevos := v_nuevos + v_facturas;

  -- La hora de lo que ya estaba (entró por Excel o antes del agente 1.0.4):
  -- el mismo renglón trae ahora su hora. Solo se llena, nunca se cambia.
  update public.movimientos_inventario m set hora = r.hora
    from _r r
   where m.empresa_id = p_empresa and m.renglon = r.renglon and m.hora is null and r.hora is not null and not r.de_notas;

  -- La cantidad de una venta hecha en otra unidad que la principal (antes del
  -- agente 1.0.6 entraba tal cual): la del agente ya viene en la principal.
  update public.movimientos_inventario m set cantidad = r.cantidad
    from _r r
   where m.empresa_id = p_empresa and m.renglon = r.renglon and m.origen = 'venta' and r.corrige_cantidad
     and not r.de_notas and m.cantidad <> r.cantidad;
  update public.ventas_facturas_notas f set cantidad = r.cantidad
    from _r r
   where f.empresa_id = p_empresa and f.renglon = r.renglon and r.corrige_cantidad and r.de_notas and f.cantidad <> r.cantidad;

  -- Lo que devuelve cada DEV que ya estaba (entró antes del agente 1.0.5).
  -- Igual: solo se llena, nunca se cambia.
  update public.movimientos_inventario m set devuelve = r.devuelve
    from _r r
   where m.empresa_id = p_empresa and m.renglon = r.renglon and m.tipo_doc = 'DEV' and m.devuelve is null and r.devuelve is not null;

  -- Notas de importaciones anteriores que esta importación factura.
  -- Según Valery (agente 1.0.7): la factura que viene de una nota y estaba en
  -- el kardex descontaba dos veces; ya quedó en ventas_facturas_notas arriba,
  -- sale del kardex. La que Valery sí descontó y estaba como factura de notas
  -- ya entró al kardex arriba, sale de ventas_facturas_notas. Y cada nota queda
  -- con la factura que dice Valery.
  delete from public.movimientos_inventario m
   using _r r
   where m.empresa_id = p_empresa and m.renglon = r.renglon and r.reclasifica and r.de_notas
     and m.origen = 'venta' and m.tipo_doc = 'FAC';
  get diagnostics v_n = row_count; v_reacomodo := v_reacomodo + v_n;
  delete from public.ventas_facturas_notas f
   using _r r
   where f.empresa_id = p_empresa and f.renglon = r.renglon and r.reclasifica and r.tipo = 'FAC' and not r.de_notas;
  get diagnostics v_n = row_count; v_reacomodo := v_reacomodo + v_n;
  update public.movimientos_inventario m set facturada_con = r.facturada_con, facturada_en = v_id
    from _r r
   where m.empresa_id = p_empresa and m.renglon = r.renglon and r.reclasifica and r.tipo = 'NET' and m.tipo_doc = 'NET'
     and m.facturada_con is distinct from r.facturada_con;
  get diagnostics v_n = row_count; v_reacomodo := v_reacomodo + v_n;

  if jsonb_typeof(p_notas) = 'array' and jsonb_array_length(p_notas) > 0 then
    update public.movimientos_inventario m
       set facturada_con = n.factura, facturada_en = v_id
      from jsonb_to_recordset(p_notas) as n(renglon text, factura text)
     where m.empresa_id = p_empresa and m.renglon = n.renglon and m.tipo_doc = 'NET'
       -- Solo las que no tenían factura: volver a marcar la misma contaba como
       -- «algo nuevo» y dejaba una importación vacía cada hora.
       and m.facturada_con is null;
    get diagnostics v_notas = row_count;
  end if;

  if v_nuevos = 0 and v_notas = 0 and v_reacomodo = 0 then
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
revoke execute on function public._importar_ventas(text, text, text, jsonb, jsonb, uuid, boolean) from public, anon, authenticated;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: ajuste 1, notas 1, importador 1, solo_servidor 1.
select
  (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'origen_mov' and e.enumlabel = 'ajuste') as ajuste,
  (select count(*) from information_schema.columns where table_schema = 'public'
    and table_name = 'valery_ajustes' and column_name = 'notas_segun_valery') as notas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_importar_ventas' and p.prosrc like '%reclasifica%') as importador,
  (select case when not has_function_privilege('authenticated', 'public._importar_ventas(text, text, text, jsonb, jsonb, uuid, boolean)', 'execute')
               then 1 else 0 end) as solo_servidor;
