-- ============================================================================
-- PERMISOS POR USUARIO  ·  Tarea 3 del plan
-- Ejecutar en el SQL Editor. Se puede repetir sin problema.
-- ============================================================================

alter table usuarios
  add column if not exists permisos jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- El Owner puede SIEMPRE, sin mirar sus permisos.
--
-- Es irrevocable POR CONSTRUCCION, no por una regla de pantalla que alguien
-- pueda olvidar o saltarse: aunque se le apaguen todos los interruptores, sigue
-- entrando. Para eso es el Owner; si no, seria un usuario cualquiera.
-- ---------------------------------------------------------------------------
create or replace function puede(clave text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select es_owner() or coalesce((permisos ->> clave)::boolean, false)
     from usuarios
     where id = auth.uid() and activo),
    false)
$$;

-- ---------------------------------------------------------------------------
-- Un Owner no se puede desactivar. En la BASE, no en el formulario: una regla
-- de pantalla se olvida al escribir la siguiente pantalla.
-- ---------------------------------------------------------------------------
create or replace function impedir_owner_inactivo() returns trigger
language plpgsql as $$
begin
  if old.rol = 'owner' and new.activo = false then
    raise exception 'Un Owner no puede desactivarse.';
  end if;
  if old.rol = 'owner' and new.rol <> 'owner'
     and not exists (select 1 from usuarios
                     where rol = 'owner' and activo and id <> old.id) then
    raise exception 'No puedes quitar el ultimo Owner: el sistema quedaria sin dueno.';
  end if;
  return new;
end $$;

drop trigger if exists trg_owner_activo on usuarios;
create trigger trg_owner_activo
  before update on usuarios
  for each row execute function impedir_owner_inactivo();

-- ---------------------------------------------------------------------------
-- COMPROBACIONES (correr despues; deben dar lo indicado)
-- ---------------------------------------------------------------------------
-- 1) El Owner puede aunque su columna permisos este vacia:
--      select puede('expenses');            -->  esperado: true
--
-- 2) No se puede desactivar a un Owner:
--      update usuarios set activo = false where rol = 'owner';
--                                           -->  esperado: ERROR
