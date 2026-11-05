-- 51 · Toda factura es venta, y las notas de entrega a crédito no
--
-- Pedido del Owner (2026-11-04), al ver que la FAC 1652 y la 1653 no salían
-- en Ventas: «necesito que el agente vea todo y registre todas las facturas
-- porque son ventas per se» y «no todas las notas de entrega son ventas
-- efectivas, algunas son cuentas por cobrar».
--
-- Hasta ahora una factura que cobraba notas de entrega ya importadas no
-- entraba a ninguna parte (para no descontar la mercancía dos veces), y la
-- venta quedaba el día de la nota. La 1652 cobró la NET 9095 (30-09) y la
-- NET 9200 (08-10); la 1653, la NET 9215 (09-10): notas a crédito de V&B.
--
--   · ventas_facturas_notas: los renglones de esas facturas. Son la venta (en
--     su fecha), pero NO tocan la existencia: la mercancía salió con la nota.
--     Se leen con el mismo permiso que las ventas del kardex.
--   · _importar_ventas: un renglón con «de_notas» va a esa tabla y no al kardex.
--   · valery_ajustes.facturas_rellenas: la primera actualización automática
--     después de esto pide todo desde el corte, una vez, para traer las
--     facturas de notas que ya habían pasado (lib/valery/ventas-auto.ts).
--   · ventas_notas_en_cxc(empresa): qué notas de entrega están en Cuentas por
--     Cobrar (por su número, «NE-9095») y si ya se cobraron (liquidadas o en
--     cero). Ventas no cuenta como vendida una nota a crédito sin cobrar; quien
--     ve Ventas sin ver la cartera recibe solo el número y si se cobró: ni
--     cliente ni monto.
--   · Una nota que ya estaba marcada con su factura no se vuelve a marcar en
--     cada actualización (cada hora quedaba una importación vacía).
--
-- Nunca escribe en Valery. Se puede correr más de una vez.

begin;

create table if not exists public.ventas_facturas_notas (
  id             bigserial primary key,
  empresa_id     text not null references public.empresas(id),
  renglon        text not null,
  fecha          date not null,
  hora           time,
  documento      text not null,
  cliente        text,
  codigo         text not null,
  nombre         text not null,
  cantidad       numeric not null check (cantidad > 0),
  monto_usd      numeric,
  importacion_id bigint references public.importaciones(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (empresa_id, renglon)
);
create index if not exists ventas_facturas_notas_fecha on public.ventas_facturas_notas (empresa_id, fecha);
create index if not exists ventas_facturas_notas_documento on public.ventas_facturas_notas (empresa_id, documento);
alter table public.ventas_facturas_notas enable row level security;

-- La misma regla que movimientos_ventas_lectura (migración 48). Nadie escribe
-- con su sesión: solo el importador (security definer).
drop policy if exists ventas_facturas_notas_lectura on public.ventas_facturas_notas;
create policy ventas_facturas_notas_lectura on public.ventas_facturas_notas for select using (
  empresa_id = any ((select public.empresas_permitidas())::text[])
  and (select public.puede('revenue')) and (select public.puede_finanzas()));
revoke insert, update, delete on public.ventas_facturas_notas from anon, authenticated;

alter table public.valery_ajustes add column if not exists facturas_rellenas boolean not null default false;

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
    codigo text, nombre text, cantidad numeric, monto_usd numeric, facturada_con text, de_notas boolean);
  update _r set de_notas = false where de_notas is null;

  select format('%s %s (fila con %s)', r.tipo, coalesce(r.documento, '?'), r.codigo) into v_malo from _r r
   where r.renglon is null or r.fecha is null or r.codigo is null or r.cantidad is null or r.cantidad <= 0
      or r.tipo not in ('FAC', 'NET', 'DEV')
      or r.direccion is distinct from case when r.tipo = 'DEV' then 'entrada' else 'salida' end
      -- La factura de una nota es solo eso: una FAC.
      or (r.de_notas and r.tipo <> 'FAC')
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

  -- Notas de importaciones anteriores que esta importación factura.
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

-- Las notas de entrega que están en Cuentas por Cobrar, por número.
create or replace function public.ventas_notas_en_cxc(p_empresa text)
returns table (numero text, cobrada boolean)
language sql stable security definer set search_path = public as $$
  select n.numero, bool_and(n.cobrada)
    from (
      select ltrim((regexp_match(upper(split_part(c.documento, '·', 1)), '^NET?[\s\-#:.]*([0-9]+)'))[1], '0') as numero,
             (c.estado = 'liquidada' or s.saldo <= 0.005) as cobrada
        from public.cuentas c
        join public.cuentas_saldo s on s.id = c.id
       where c.empresa_id = p_empresa and c.tipo = 'cobrar'
         and public.puede_empresa(p_empresa) and public.puede('revenue') and public.puede_finanzas()
    ) n
   where n.numero is not null and n.numero <> ''
   group by n.numero;
$$;
revoke execute on function public.ventas_notas_en_cxc(text) from public, anon;
grant execute on function public.ventas_notas_en_cxc(text) to authenticated;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: tabla 1, rls 1, politica 1, rellenas 1, importador 1, solo_servidor 1, en_cxc 1.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'ventas_facturas_notas') as tabla,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'ventas_facturas_notas' and c.relrowsecurity) as rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ventas_facturas_notas'
    and policyname = 'ventas_facturas_notas_lectura') as politica,
  (select count(*) from information_schema.columns where table_schema = 'public'
    and table_name = 'valery_ajustes' and column_name = 'facturas_rellenas') as rellenas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_importar_ventas' and p.prosrc like '%ventas_facturas_notas%') as importador,
  (select case when not has_function_privilege('authenticated', 'public._importar_ventas(text, text, text, jsonb, jsonb, uuid, boolean)', 'execute')
               then 1 else 0 end) as solo_servidor,
  (select case when has_function_privilege('authenticated', 'public.ventas_notas_en_cxc(text)', 'execute')
                and not has_function_privilege('anon', 'public.ventas_notas_en_cxc(text)', 'execute') then 1 else 0 end) as en_cxc;
