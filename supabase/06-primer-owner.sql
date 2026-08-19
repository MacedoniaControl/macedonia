-- ============================================================================
-- CREAR EL PRIMER OWNER  (una sola vez)
--
-- El problema del huevo y la gallina: la politica dice que SOLO un owner puede
-- escribir en `usuarios`, pero todavia no existe ninguno. Este paso lo resuelve
-- desde fuera, con permisos de administrador de la base.
--
-- ---------------------------------------------------------------------------
-- PASO 1 — Crear la cuenta en el panel de Supabase (NO por SQL)
--
--   Authentication -> Users -> Add user -> Create new user
--     Email:    greeg@macedonia.local      <-- el usuario sera "greeg"
--     Password: (elige una y guardala)
--     Auto Confirm User:  SI  <-- IMPORTANTE, si no queda sin confirmar
--                                  y no podra entrar
--
--   Se hace por el panel y no por SQL porque insertar a mano en auth.users
--   depende de detalles internos de Supabase que cambian entre versiones.
--
-- PASO 2 — Ejecutar lo de abajo, que le da rol y empresa.
-- ---------------------------------------------------------------------------

insert into usuarios (id, nombre, rol, empresa_id, activo)
select id, 'Greeg Vizcaino', 'owner', null, true
from auth.users
where email = 'greeg@macedonia.local'
on conflict (id) do update
  set rol = 'owner', activo = true, empresa_id = null;

-- empresa_id = null significa acceso a TODAS las empresas.
-- Solo tiene sentido para el owner: los demas llevan 'sumigases' o 'sudematin'.

-- ---------------------------------------------------------------------------
-- COMPROBACION: debe devolver una fila con rol = owner.
-- Si devuelve 0 filas, el correo del PASO 1 no coincide exactamente.
-- ---------------------------------------------------------------------------
select u.nombre,
       u.rol::text                                   as rol,
       coalesce(u.empresa_id, 'TODAS')               as empresa,
       split_part(a.email, '@', 1)                   as usuario_para_entrar,
       case when a.email_confirmed_at is null
            then 'FALTA CONFIRMAR — vuelve al panel y activa Auto Confirm'
            else 'OK — puede entrar' end             as estado
from usuarios u
join auth.users a on a.id = u.id
where u.rol = 'owner';
