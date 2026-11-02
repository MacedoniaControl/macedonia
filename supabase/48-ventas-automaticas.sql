-- 48 · Ventas automáticas por el Puente Valery, y el apartado Ventas
--
-- Pedido del Owner (2026-11-02): que las ventas entren solas desde Valery,
-- cada hora o con un botón, y un apartado donde verlas.
--
--   · valery_solicitudes.automatica: las actualizaciones que pide el servidor
--     cada hora (o el botón «Actualizar ahora»). Una sola en curso por empresa.
--   · valery_ajustes: si la empresa trae sus ventas sola y cada cuánto.
--   · _importar_ventas: el importador de la migración 32, tal cual, sin la
--     comprobación de permisos y con el usuario como parámetro. Lo llaman:
--       - importar_ventas_valery (el Excel y «Aplicar» del panel): comprueba
--         permisos como siempre y le pasa auth.uid();
--       - importar_ventas_puente (lo automático): solo la clave de servicio, y
--         solo para una actualización automática lista.
--     Un solo importador: mismas reglas y mismas claves, venga de donde venga.
--   · Lectura de ventas: el kardex ya lo leen el Owner y los Administradores
--     con «inventory»; el apartado Ventas tiene su propio permiso («revenue»,
--     el slug de la ruta), que se agrega a los Administradores.
--
-- Nunca escribe en Valery. Se puede correr más de una vez.

begin;

-- ---------------------------------------------------------------- 1. ACTUALIZACIONES AUTOMÁTICAS
alter table public.valery_solicitudes add column if not exists automatica boolean not null default false;
create unique index if not exists valery_auto_en_curso on public.valery_solicitudes (empresa_id)
  where automatica and estado in ('pendiente', 'en_proceso');
create index if not exists valery_solicitud_auto on public.valery_solicitudes (empresa_id, id desc) where automatica;

create table if not exists public.valery_ajustes (
  empresa_id      text primary key references public.empresas(id),
  ventas_auto     boolean not null default true,
  cada_min        integer not null default 60 check (cada_min between 15 and 1440),
  actualizado_por uuid references public.usuarios(id),
  actualizado_en  timestamptz not null default now()
);
alter table public.valery_ajustes enable row level security;

drop policy if exists valery_ajustes_lectura on public.valery_ajustes;
create policy valery_ajustes_lectura on public.valery_ajustes for select
  using (public.puede_empresa(empresa_id) and public.puede_finanzas());
drop policy if exists valery_ajustes_inserta on public.valery_ajustes;
create policy valery_ajustes_inserta on public.valery_ajustes for insert
  with check (public.puede_empresa(empresa_id) and public.puede_finanzas());
drop policy if exists valery_ajustes_cambia on public.valery_ajustes;
create policy valery_ajustes_cambia on public.valery_ajustes for update
  using (public.puede_empresa(empresa_id) and public.puede_finanzas())
  with check (public.puede_empresa(empresa_id) and public.puede_finanzas());

-- ---------------------------------------------------------------- 2. UN SOLO IMPORTADOR
-- Copia exacta de importar_ventas_valery (migración 32) salvo: sin la
-- comprobación de permisos (la hace quien la llama), auth.uid() → p_usuario, y
-- con p_vacio_es_error en false no falla si no hay nada nuevo (ni renglones).
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
    renglon text, fecha date, direccion text, tipo text, documento text, cliente text,
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
    (empresa_id, fecha, direccion, origen, codigo, nombre, cantidad, documento, importacion_id, usuario_id,
     renglon, tipo_doc, cliente, monto_usd, facturada_con)
  select p_empresa, r.fecha, r.direccion::public.direccion_mov, 'venta', r.codigo, coalesce(nullif(r.nombre, ''), r.codigo), r.cantidad,
         r.documento, v_id, p_usuario, r.renglon, r.tipo, r.cliente, r.monto_usd, r.facturada_con
    from _r r
  on conflict (empresa_id, renglon) where renglon is not null do nothing;
  get diagnostics v_nuevos = row_count;

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
revoke execute on function public._importar_ventas(text, text, text, jsonb, jsonb, uuid, boolean) from public, anon, authenticated;

-- El Excel y «Aplicar» del panel: igual que antes.
create or replace function public.importar_ventas_valery(
  p_empresa text, p_archivo text, p_hash text, p_renglones jsonb, p_notas jsonb default '[]'::jsonb)
returns table (importacion_id bigint, nuevos integer, repetidos integer, notas_facturadas integer)
language plpgsql security definer set search_path = public as $$
begin
  if not (public.puede_empresa(p_empresa) and public.puede('inventory') and public.puede_finanzas()) then
    raise exception 'Importar ventas lo hacen el Owner o un Administrador.';
  end if;
  return query select * from public._importar_ventas(p_empresa, p_archivo, p_hash, p_renglones, p_notas, auth.uid(), true);
end $$;
revoke execute on function public.importar_ventas_valery(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.importar_ventas_valery(text, text, text, jsonb, jsonb) to authenticated;

-- Lo automático: solo el servidor (clave de servicio), solo una actualización
-- automática de ventas que el agente ya entregó. Queda «aplicada» en la misma
-- transacción en que entran las ventas.
create or replace function public.importar_ventas_puente(p_solicitud bigint, p_renglones jsonb, p_notas jsonb default '[]'::jsonb)
returns table (importacion_id bigint, nuevos integer, repetidos integer, notas_facturadas integer)
language plpgsql security definer set search_path = public as $$
declare
  s public.valery_solicitudes%rowtype;
  r record;
begin
  select * into s from public.valery_solicitudes where id = p_solicitud for update;
  if not found then raise exception 'No existe la solicitud %.', p_solicitud; end if;
  if not s.automatica or s.tipo <> 'ventas' then raise exception 'La solicitud % no es una actualización automática de ventas.', p_solicitud; end if;
  if s.estado <> 'lista' then raise exception 'La solicitud % no está lista (está %).', p_solicitud, s.estado; end if;
  select * into r from public._importar_ventas(
    s.empresa_id,
    format('Puente Valery · automática %s a %s', s.parametros ->> 'desde', s.parametros ->> 'hasta'),
    'puente-valery-' || s.id, p_renglones, p_notas, s.creado_por, false);
  update public.valery_solicitudes set estado = 'aplicada', aplicado_en = now(), importacion_id = r.importacion_id where id = s.id;
  return query select r.importacion_id, r.nuevos, r.repetidos, r.notas_facturadas;
end $$;
revoke execute on function public.importar_ventas_puente(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.importar_ventas_puente(bigint, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- 3. EL APARTADO VENTAS
-- Ver las ventas del kardex con el permiso del apartado. Se suma a
-- movimientos_lectura (las políticas se combinan con «o»): no abre nada que no
-- sea venta, ni de otra empresa, ni a quien no es Owner o Administrador.
drop policy if exists movimientos_ventas_lectura on public.movimientos_inventario;
create policy movimientos_ventas_lectura on public.movimientos_inventario for select using (
  origen = 'venta'
  and empresa_id = any ((select public.empresas_permitidas())::text[])
  and (select public.puede('revenue')) and (select public.puede_finanzas()));

-- Los Administradores ven todo de su empresa salvo lo de lib/auth/permisos.ts
-- (ADMIN_APAGADOS): la sección nueva les llega encendida, como en la plantilla.
update public.usuarios
   set permisos = coalesce(permisos, '{}'::jsonb) || '{"revenue": true}'::jsonb
 where rol::text = 'admin' and not (coalesce(permisos, '{}'::jsonb) ? 'revenue');

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: columna 1, ajustes 1, funciones 3, politica 1, auto_unico 1.
select
  (select count(*) from information_schema.columns where table_schema = 'public'
    and table_name = 'valery_solicitudes' and column_name = 'automatica') as columna,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'valery_ajustes' and c.relrowsecurity) as ajustes,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('_importar_ventas', 'importar_ventas_valery', 'importar_ventas_puente')) as funciones,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'movimientos_inventario'
    and policyname = 'movimientos_ventas_lectura') as politica,
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'valery_auto_en_curso') as auto_unico;
