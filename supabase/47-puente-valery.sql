-- 47 · Puente Valery: el agente del servidor y los pedidos desde Macedonia
--
-- Aprobado por el Owner (2026-10-24). Ver docs/decisions/puente-valery.md.
--
-- Un agente en el servidor del cliente lee una COPIA de la base de Valery y le
-- entrega a Macedonia lo que se le pide desde el panel. Nunca escribe en Valery.
--
--   · valery_agentes: un agente activo por empresa. Se guarda la HUELLA de su
--     clave (SHA-256), nunca la clave.
--   · valery_solicitudes: lo que se le pide (ventas de un rango, CxC, CxP,
--     existencias, probar conexión) y en qué va.
--   · valery_resultados: lo que entregó, por partes.
--
-- Quién: el Owner y los Administradores de esa empresa (puede_finanzas). El
-- agente no tiene usuario: lo atiende el servidor de Macedonia con la clave de
-- servicio, después de comprobar la huella (app/api/valery/agente).
--
-- Se puede correr más de una vez.

begin;

create table if not exists public.valery_agentes (
  id               bigserial primary key,
  empresa_id       text not null references public.empresas(id),
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  creado_por       uuid references public.usuarios(id),
  creado_en        timestamptz not null default now(),
  ultimo_contacto  timestamptz,
  version          text,
  info             jsonb not null default '{}'::jsonb,   -- equipo, Valery, base, método de copia
  revocado_en      timestamptz
);
-- Un solo agente vivo por empresa: generar uno nuevo revoca el anterior.
create unique index if not exists valery_agente_activo on public.valery_agentes (empresa_id) where revocado_en is null;

create table if not exists public.valery_solicitudes (
  id             bigserial primary key,
  empresa_id     text not null references public.empresas(id),
  tipo           text not null check (tipo in ('ventas', 'cxc', 'cxp', 'existencias', 'estado')),
  parametros     jsonb not null default '{}'::jsonb,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'en_proceso', 'lista', 'error', 'aplicada', 'cancelada')),
  creado_por     uuid references public.usuarios(id),
  creado_nombre  text,
  creado_en      timestamptz not null default now(),
  tomado_en      timestamptz,
  terminado_en   timestamptz,
  partes         integer,
  resumen        jsonb,
  error          text,
  aplicado_en    timestamptz,
  aplicado_por   uuid references public.usuarios(id),
  importacion_id bigint
);
create index if not exists valery_solicitud_empresa on public.valery_solicitudes (empresa_id, id desc);
create index if not exists valery_solicitud_pendiente on public.valery_solicitudes (empresa_id, id) where estado = 'pendiente';

create table if not exists public.valery_resultados (
  solicitud_id  bigint not null references public.valery_solicitudes(id) on delete cascade,
  parte         integer not null check (parte >= 1),
  datos         jsonb not null,
  primary key (solicitud_id, parte)
);

-- ---------------------------------------------------------------- QUIÉN VE
alter table public.valery_agentes enable row level security;
alter table public.valery_solicitudes enable row level security;
alter table public.valery_resultados enable row level security;

drop policy if exists valery_agentes_lectura on public.valery_agentes;
create policy valery_agentes_lectura on public.valery_agentes for select
  using (public.puede_empresa(empresa_id) and public.puede_finanzas());

drop policy if exists valery_solicitudes_lectura on public.valery_solicitudes;
create policy valery_solicitudes_lectura on public.valery_solicitudes for select
  using (public.puede_empresa(empresa_id) and public.puede_finanzas());

-- Pedir: solo pendiente, a nombre propio. Lo demás lo cambian el agente (por el
-- servidor) y las funciones de abajo.
drop policy if exists valery_solicitudes_pedir on public.valery_solicitudes;
create policy valery_solicitudes_pedir on public.valery_solicitudes for insert
  with check (public.puede_empresa(empresa_id) and public.puede_finanzas()
              and estado = 'pendiente' and creado_por = auth.uid());

drop policy if exists valery_resultados_lectura on public.valery_resultados;
create policy valery_resultados_lectura on public.valery_resultados for select
  using (exists (select 1 from public.valery_solicitudes s
                  where s.id = solicitud_id and public.puede_empresa(s.empresa_id) and public.puede_finanzas()));

-- ---------------------------------------------------------------- MARCAR (Owner o Administrador)
-- Una solicitud lista cuyas ventas ya se importaron queda «aplicada», con la
-- importación que la llevó al kardex. Cancelar: solo lo que el agente no tomó.
create or replace function public.valery_marcar_solicitud(p_id bigint, p_estado text, p_importacion bigint default null)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.valery_solicitudes%rowtype;
begin
  select * into s from public.valery_solicitudes where id = p_id for update;
  if not found then raise exception 'No existe la solicitud %.', p_id; end if;
  if not (public.puede_empresa(s.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador de esta empresa.';
  end if;
  if p_estado = 'aplicada' then
    if s.estado <> 'lista' then raise exception 'La solicitud % no está lista (está %).', p_id, s.estado; end if;
    update public.valery_solicitudes set estado = 'aplicada', aplicado_en = now(), aplicado_por = auth.uid(), importacion_id = p_importacion
     where id = p_id;
  elsif p_estado = 'cancelada' then
    if s.estado <> 'pendiente' then raise exception 'Solo se cancela lo que el agente todavía no tomó.'; end if;
    update public.valery_solicitudes set estado = 'cancelada', terminado_en = now() where id = p_id;
  else
    raise exception 'Estado no permitido: %.', p_estado;
  end if;
end $$;
revoke execute on function public.valery_marcar_solicitud(bigint, text, bigint) from public, anon;
grant execute on function public.valery_marcar_solicitud(bigint, text, bigint) to authenticated;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: tablas 3, rls 3, funcion 1.
select
  (select count(*) from information_schema.tables where table_schema = 'public'
    and table_name in ('valery_agentes', 'valery_solicitudes', 'valery_resultados')) as tablas,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('valery_agentes', 'valery_solicitudes', 'valery_resultados') and c.relrowsecurity) as rls,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'valery_marcar_solicitud') as funcion;
