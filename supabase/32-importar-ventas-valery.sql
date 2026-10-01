-- 32 · Importar las ventas de Valery al inventario
--
-- La pantalla lee la «Relación de Ventas Diarias (Detallado por Renglón)» de
-- Valery y manda los renglones a importar_ventas_valery(), que vuelve a
-- comprobar todo y los guarda en una sola transacción: o entra el archivo
-- completo o no entra nada.
--
--   · FAC y NET → salida; DEV → entrada.
--   · Una factura que factura una nota ya descontada no se manda (la pantalla
--     lo decide con las reglas del histórico); la nota queda marcada con la
--     factura en facturada_con, para que otra factura no la use.
--   · Cada renglón trae su clave (renglon): el mismo renglón en dos archivos
--     que se solapan entra una sola vez.
--   · Solo desde el corte de la empresa (cortes_inventario): lo anterior ya
--     está en la existencia que se alineó con Valery. Una empresa sin corte
--     todavía no puede importar: su existencia no tiene punto de partida.
--   · Borrar la importación (deshacer_importacion_ventas) revierte todo: los
--     movimientos cuelgan de ella con on delete cascade.
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------- 1. EL RENGLÓN DE VALERY EN EL KARDEX
alter table public.movimientos_inventario
  add column if not exists renglon       text,           -- clave del renglón de Valery
  add column if not exists tipo_doc      text,           -- FAC | NET | DEV
  add column if not exists cliente       text,
  add column if not exists monto_usd     numeric(14,2),  -- venta sin IVA, para reconocer la factura de una nota
  add column if not exists facturada_con text,           -- en una NET: «FAC 0000001433»
  add column if not exists facturada_en  bigint;         -- la importación que la marcó (deshacerla la libera)

create unique index if not exists mov_renglon_unico
  on public.movimientos_inventario (empresa_id, renglon) where renglon is not null;
-- La regla vieja (01-schema) no dejaba dos movimientos con el mismo documento,
-- producto y fecha: una factura que trae el mismo producto en dos renglones
-- perdía uno. Los renglones de Valery se cuidan con su propia clave
-- (mov_renglon_unico); la regla vieja queda para el resto.
drop index if exists public.movimientos_unicos_por_documento;
create unique index movimientos_unicos_por_documento
  on public.movimientos_inventario (empresa_id, origen, documento, codigo, fecha)
  where documento is not null and origen <> 'manual' and renglon is null;

create index if not exists mov_notas_valery
  on public.movimientos_inventario (empresa_id, fecha) where tipo_doc = 'NET';

-- ---------------------------------------------------------------- 2. DESDE CUÁNDO SE IMPORTA
create table if not exists public.cortes_inventario (
  empresa_id text primary key references public.empresas(id),
  desde      date not null,     -- primer día que se puede importar
  nota       text not null
);
insert into public.cortes_inventario (empresa_id, desde, nota)
values ('sumigases', '2026-09-24', 'La existencia se alineó con Valery el 23-09-2026 (importación 2): lo vendido hasta ese día ya está descontado.')
on conflict (empresa_id) do nothing;

alter table public.cortes_inventario enable row level security;
drop policy if exists cortes_lectura on public.cortes_inventario;
create policy cortes_lectura on public.cortes_inventario for select to authenticated
  using (public.puede_empresa(empresa_id));
grant select on public.cortes_inventario to authenticated;

-- Las importaciones de ventas las ven el Owner y el Administrador desde el
-- inventario (antes solo con el permiso de Configuración).
drop policy if exists importaciones_lectura_inventario on public.importaciones;
create policy importaciones_lectura_inventario on public.importaciones for select using (
  public.puede_empresa(empresa_id) and (select public.puede('inventory')) and (select public.puede_finanzas()));

-- ---------------------------------------------------------------- 3. IMPORTAR
-- p_renglones: [{renglon, fecha, direccion, tipo, documento, cliente, codigo, nombre, cantidad, monto_usd, facturada_con}, …]
-- p_notas:     [{renglon, factura}]   notas de importaciones anteriores que ahora quedan facturadas
create or replace function public.importar_ventas_valery(
  p_empresa text, p_archivo text, p_hash text, p_renglones jsonb, p_notas jsonb default '[]'::jsonb)
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
  if not (public.puede_empresa(p_empresa) and public.puede('inventory') and public.puede_finanzas()) then
    raise exception 'Importar ventas lo hacen el Owner o un Administrador.';
  end if;
  select c.desde into v_corte from public.cortes_inventario c where c.empresa_id = p_empresa;
  if v_corte is null then
    raise exception 'Todavía no se pueden importar ventas de esta empresa: primero hay que alinear su existencia con Valery (como se hizo con Sumigases el 23-09-2026).';
  end if;
  if jsonb_typeof(p_renglones) is distinct from 'array' or jsonb_array_length(p_renglones) = 0 then
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
  select p_empresa, 'ventas', p_archivo, p_hash, 0, min(fecha), max(fecha), auth.uid() from _r
  returning id into v_id;

  insert into public.movimientos_inventario
    (empresa_id, fecha, direccion, origen, codigo, nombre, cantidad, documento, importacion_id, usuario_id,
     renglon, tipo_doc, cliente, monto_usd, facturada_con)
  select p_empresa, r.fecha, r.direccion::public.direccion_mov, 'venta', r.codigo, coalesce(nullif(r.nombre, ''), r.codigo), r.cantidad,
         r.documento, v_id, auth.uid(), r.renglon, r.tipo, r.cliente, r.monto_usd, r.facturada_con
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
    raise exception 'Todo lo de este archivo ya estaba importado: no hay nada nuevo.';
  end if;
  update public.importaciones set filas = v_nuevos where id = v_id;
  return query select v_id, v_nuevos, v_total - v_nuevos, v_notas;
end $$;
revoke execute on function public.importar_ventas_valery(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.importar_ventas_valery(text, text, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- 4. DESHACER
-- Borra una importación de ventas de Valery y, con ella, sus movimientos.
create or replace function public.deshacer_importacion_ventas(p_id bigint)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  i public.importaciones%rowtype;
  n integer;
begin
  select * into i from public.importaciones where id = p_id;
  if not found then raise exception 'No existe la importación %.', p_id; end if;
  if not (public.puede_empresa(i.empresa_id) and public.puede('inventory') and public.puede_finanzas()) then
    raise exception 'Deshacer una importación lo hacen el Owner o un Administrador.';
  end if;
  if i.tipo <> 'ventas' or not exists (select 1 from public.movimientos_inventario m where m.importacion_id = p_id and m.renglon is not null) then
    raise exception 'Solo se deshacen aquí las importaciones de ventas de Valery hechas desde esta pantalla.';
  end if;
  select count(*) into n from public.movimientos_inventario where importacion_id = p_id;
  -- Las notas de importaciones anteriores que esta marcó como facturadas vuelven a estar libres.
  update public.movimientos_inventario set facturada_con = null, facturada_en = null where facturada_en = p_id;
  delete from public.importaciones where id = p_id;
  return n;
end $$;
revoke execute on function public.deshacer_importacion_ventas(bigint) from public, anon;
grant execute on function public.deshacer_importacion_ventas(bigint) to authenticated;

-- ---------------------------------------------------------------- 5. COMPROBACIÓN
-- Debe decir: columnas 6, corte 2026-09-24, funciones 2.
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'movimientos_inventario'
     and column_name in ('renglon', 'tipo_doc', 'cliente', 'monto_usd', 'facturada_con', 'facturada_en')) as columnas,
  (select desde from public.cortes_inventario where empresa_id = 'sumigases') as corte,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('importar_ventas_valery', 'deshacer_importacion_ventas')) as funciones;
