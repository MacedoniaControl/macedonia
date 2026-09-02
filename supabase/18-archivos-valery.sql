-- ============================================================================
-- ARCHIVOS DE VALERY EN SUPABASE STORAGE
--
-- Los PDF que se suben de Valery vivian como base64 en localStorage. Dos
-- problemas, y el segundo es peor que el primero:
--
--   1. Se pierden si alguien limpia su navegador, y solo los ve quien los
--      subio: el de al lado no sabe que existen.
--   2. localStorage tiene un tope de ~5 MB. Un PDF en base64 pesa un tercio
--      mas que el original, asi que con pocos archivos se llena — y cuando se
--      llena, la escritura FALLA EN SILENCIO. Se sube el archivo, se ve en la
--      lista, y al recargar no esta.
--
-- El bucket es PRIVADO: son documentos comerciales con nombres de clientes y
-- montos. Se sirven con URL firmada de corta duracion, no por enlace publico.
-- ============================================================================

set search_path to public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('valery', 'valery', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf'];

-- ---------------------------------------------------------------------------
-- Indice de archivos.
--
-- El bucket guarda el binario; esta tabla guarda QUE es cada archivo. Sin ella
-- habria que deducir la empresa y el tipo del nombre del archivo, que es
-- exactamente lo fragil que ya era.
-- ---------------------------------------------------------------------------
create table if not exists public.archivos_valery (
  id          bigserial primary key,
  empresa_id  text not null references public.empresas(id),
  tipo        text not null,              -- 'nota_entrega' | 'devolucion' | 'cotizacion'
  correlativo text,                       -- el que traiga el nombre del archivo, si trae
  nombre      text not null,              -- como se llamaba el archivo original
  ruta        text not null unique,       -- su ubicacion dentro del bucket
  bytes       integer,
  fecha       date not null default current_date,
  subido_por  uuid references public.usuarios(id),
  created_at  timestamptz not null default now()
);

create index if not exists archivos_valery_empresa on public.archivos_valery (empresa_id, tipo, fecha desc);

alter table public.archivos_valery enable row level security;

drop policy if exists archivos_lectura on public.archivos_valery;
create policy archivos_lectura on public.archivos_valery
  for select using (puede_empresa(empresa_id));

drop policy if exists archivos_escribe on public.archivos_valery;
create policy archivos_escribe on public.archivos_valery
  for all using (puede_empresa(empresa_id))
  with check (puede_empresa(empresa_id));

-- ---------------------------------------------------------------------------
-- Quien puede tocar el bucket.
--
-- La ruta arranca con el id de empresa (valery/sumigases/...), asi que el
-- primer tramo del nombre es la empresa y se puede comprobar contra el permiso.
-- Sin esto, cualquiera con sesion leeria los documentos de la otra empresa —
-- y son empresas separadas.
-- ---------------------------------------------------------------------------
drop policy if exists valery_lee on storage.objects;
create policy valery_lee on storage.objects
  for select using (
    bucket_id = 'valery'
    and puede_empresa((storage.foldername(name))[1])
  );

drop policy if exists valery_sube on storage.objects;
create policy valery_sube on storage.objects
  for insert with check (
    bucket_id = 'valery'
    and puede_empresa((storage.foldername(name))[1])
  );

drop policy if exists valery_borra on storage.objects;
create policy valery_borra on storage.objects
  for delete using (
    bucket_id = 'valery'
    and puede_empresa((storage.foldername(name))[1])
    and auth_rol() in ('owner','admin')
  );

select 'bucket' as que, id as valor from storage.buckets where id = 'valery'
union all
select 'tabla', table_name from information_schema.tables
 where table_schema='public' and table_name='archivos_valery';
