-- ============================================================================
-- MACEDONIA — PERMISOS POR USUARIO: TODO EN UNA PEGADA
--
-- Pegar COMPLETO en: panel de Supabase -> SQL Editor -> New query -> Run
--
--   1) Permisos por usuario, funcion puede(), Owner irrevocable
--   2) Alertas con contador + arreglo de para_rol
--   3) Las 34 politicas pasan a consultar permisos en vez del rol
--   4) Verificacion: 10 pruebas — TODAS deben decir OK
--
-- Al terminar, pestaña RESULTS (no Chart): salen las 10 filas.
-- Si alguna dice FALLA, avisar antes de cargar datos reales.
-- ============================================================================


-- ####################  07-permisos  ####################

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

-- ####################  08-alertas  ####################

-- ============================================================================
-- ALERTAS CON CONTADOR  ·  Tarea 4 del plan
-- Ejecutar DESPUES de 07-permisos.sql. Se puede repetir sin problema.
-- ============================================================================

alter table notificaciones
  add column if not exists veces       int not null default 1,
  add column if not exists ultima_vez  timestamptz not null default now(),
  add column if not exists clave_grupo text;

-- Una sola alerta ABIERTA por grupo (persona + seccion).
-- Al marcarla revisada el indice la libera, y el siguiente intento abre una
-- alerta NUEVA: asi se sabe que volvio a pasar despues de darlo por cerrado,
-- en vez de que se sume en silencio a una que ya se despacho.
create unique index if not exists notif_grupo_abierto
  on notificaciones (clave_grupo)
  where estado = 'pendiente' and clave_grupo is not null;

-- ---------------------------------------------------------------------------
-- ARREGLO INDEPENDIENTE DEL SISTEMA DE PERMISOS
--
-- para_rol existia en la tabla y NINGUNA politica la consultaba: una alerta
-- marcada "solo Owner" la veia cualquier administrador. Para las alertas de
-- acceso no autorizado eso es grave: le llegarian al administrador sobre el que
-- se esta alertando.
-- ---------------------------------------------------------------------------
drop policy if exists notificaciones_lectura on notificaciones;
create policy notificaciones_lectura on notificaciones
  for select using (
    puede_empresa(empresa_id)
    and (
      para_usuario = auth.uid()
      or (para_rol is not null and auth_rol() = para_rol)
      or (para_rol is null and para_usuario is null and auth_rol() in ('owner','admin'))
    )
  );

-- ---------------------------------------------------------------------------
-- Crea la alerta, o incrementa la que ya esta abierta para ese grupo.
-- ---------------------------------------------------------------------------
create or replace function alertar(
  p_clave_grupo text,
  p_tipo        text,
  p_titulo      text,
  p_mensaje     text,
  p_para_rol    rol_usuario,
  p_empresa     text,
  p_payload     jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notificaciones (empresa_id, tipo, titulo, mensaje, para_rol,
                              clave_grupo, payload, veces, ultima_vez)
  values (p_empresa, p_tipo, p_titulo, p_mensaje, p_para_rol,
          p_clave_grupo, p_payload, 1, now())
  on conflict (clave_grupo) where estado = 'pendiente' and clave_grupo is not null
  do update set veces      = notificaciones.veces + 1,
                ultima_vez = now(),
                mensaje    = p_mensaje;
end $$;

-- ---------------------------------------------------------------------------
-- COMPROBACION DEL CONTADOR (correr despues)
-- ---------------------------------------------------------------------------
-- select alertar('prueba:1','acceso_denegado','Prueba','Primero','owner','sumigases','{}'::jsonb);
-- select alertar('prueba:1','acceso_denegado','Prueba','Segundo','owner','sumigases','{}'::jsonb);
-- select veces from notificaciones where clave_grupo = 'prueba:1';
--                          -->  esperado: UNA fila con veces = 2
-- delete from notificaciones where clave_grupo = 'prueba:1';

-- ####################  09-politicas-permisos  ####################

-- ============================================================================
-- LAS POLITICAS CONSULTAN PERMISOS POR USUARIO  ·  Tarea 5
-- Ejecutar DESPUES de 07-permisos.sql. Se puede repetir sin problema.
--
-- Antes preguntaban por el ROL (auth_rol() in ('owner','admin')).
-- Ahora preguntan por el PERMISO de cada persona: puede('<clave>').
-- Para el Owner, puede() devuelve true siempre: sigue entrando a todo.
-- ============================================================================

-- La pared entre empresas ahora admite el permiso "otra_empresa".
-- Se amplia AQUI y no en cada politica: un solo lugar donde se decide, en vez
-- de 34 que pueden desincronizarse.
create or replace function puede_empresa(e text) returns boolean
language sql stable security definer set search_path = public as $$
  select es_owner()
      or coalesce(auth_empresa() = e, false)
      or coalesce((select (permisos ->> 'otra_empresa')::boolean
                   from usuarios where id = auth.uid() and activo), false)
$$;

-- ---------------------------------------------------------------- PRODUCTOS
drop policy if exists productos_lectura on productos;
create policy productos_lectura on productos
  for select using (puede_empresa(empresa_id) and puede('products'));

drop policy if exists productos_escribe on productos;
create policy productos_escribe on productos
  for all using (puede_empresa(empresa_id) and puede('products') and auth_rol() in ('owner','admin'))
  with check (puede_empresa(empresa_id) and puede('products') and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------- INVENTARIO
drop policy if exists movimientos_lectura on movimientos_inventario;
create policy movimientos_lectura on movimientos_inventario
  for select using (puede_empresa(empresa_id) and puede('inventory'));

drop policy if exists movimientos_inserta on movimientos_inventario;
create policy movimientos_inserta on movimientos_inventario
  for insert with check (puede_empresa(empresa_id) and puede('inventory'));

-- ---------------------------------------------------------------- DOCUMENTOS
drop policy if exists documentos_lectura on documentos;
create policy documentos_lectura on documentos
  for select using (puede_empresa(empresa_id)
                    and (puede('delivery-notes') or puede('quotes')));

drop policy if exists documentos_crea on documentos;
create policy documentos_crea on documentos
  for insert with check (puede_empresa(empresa_id)
                         and (puede('delivery-notes') or puede('quotes')));

drop policy if exists documentos_edita on documentos;
create policy documentos_edita on documentos
  for update using (puede_empresa(empresa_id)
                    and (puede('delivery-notes') or puede('quotes')));

-- ---------------------------------------------------------------- FISCAL
drop policy if exists notas_fiscales_lectura on notas_fiscales;
create policy notas_fiscales_lectura on notas_fiscales
  for select using (puede_empresa(empresa_id) and puede('inventory'));

-- ---------------------------------------------------------------- FINANZAS
drop policy if exists gastos_finanzas on gastos;
create policy gastos_finanzas on gastos
  for all using (puede_empresa(empresa_id) and puede('expenses'))
  with check (puede_empresa(empresa_id) and puede('expenses'));

drop policy if exists trabajadores_finanzas on trabajadores;
create policy trabajadores_finanzas on trabajadores
  for all using (puede_empresa(empresa_id) and puede('commissions'))
  with check (puede_empresa(empresa_id) and puede('commissions'));

drop policy if exists ventas_asignadas_finanzas on ventas_asignadas;
create policy ventas_asignadas_finanzas on ventas_asignadas
  for all using (puede_empresa(empresa_id) and puede('commissions'))
  with check (puede_empresa(empresa_id) and puede('commissions'));

-- ---------------------------------------------------------------- IMPORTACIONES
drop policy if exists importaciones_lectura on importaciones;
create policy importaciones_lectura on importaciones
  for select using (puede_empresa(empresa_id) and puede('settings'));

-- ---------------------------------------------------------------- AUDITORIA
-- Antes: es_owner(). Ahora: el permiso, que para el Owner siempre es true.
drop policy if exists auditoria_solo_owner on auditoria;
drop policy if exists auditoria_lectura on auditoria;
create policy auditoria_lectura on auditoria
  for select using (puede('audit'));

-- ---------------------------------------------------------------- USUARIOS
-- Gestionar usuarios sigue siendo del Owner: si un admin pudiera darse permisos
-- a si mismo, todo lo demas seria decorativo.
drop policy if exists usuarios_owner_escribe on usuarios;
create policy usuarios_owner_escribe on usuarios
  for all using (es_owner()) with check (es_owner());

-- ####################  04-verificacion  ####################

-- ============================================================================
-- MACEDONIA — VERIFICACIÓN DE SEGURIDAD
-- Ejecutar DESPUÉS de 01, 02 y 03.
--
-- Es UNA SOLA consulta (union all) a propósito: el SQL Editor de Supabase solo
-- muestra el resultado de la ÚLTIMA sentencia, así que 7 selects separados
-- mostrarían solo el séptimo. Así salen las 7 pruebas juntas.
--
-- TODAS deben decir OK. Si alguna dice FALLA, no cargues datos reales.
-- ============================================================================

with pruebas as (

  -- 1) ¿Todas las tablas tienen RLS activo?
  --    Sin RLS, cualquier usuario autenticado lee la tabla entera.
  select 1 as n, 'RLS por tabla' as prueba,
         case when count(*) = 0 then 'OK — todas protegidas'
              else 'FALLA — sin RLS: ' || string_agg(relname, ', ') end as resultado
  from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity

  union all

  -- 2) ¿Alguna vista se salta el RLS?
  --    Una vista SIN security_invoker corre con los privilegios de su dueño y
  --    lee todo, ignorando el RLS. Es la fuga más silenciosa que existe.
  select 2, 'Vistas con security_invoker',
         case when count(*) = 0 then 'OK — ninguna se salta el RLS'
              else 'FALLA — vistas peligrosas: ' || string_agg(relname, ', ') end
  from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'v'
    and coalesce(array_to_string(reloptions, ','), '') not like '%security_invoker=on%'
    and coalesce(array_to_string(reloptions, ','), '') not like '%security_invoker=true%'

  union all

  -- 3) ¿Tablas con RLS pero sin ninguna política? (nadie podría leer: rompe la app)
  select 3, 'Tablas sin políticas',
         case when count(*) = 0 then 'OK — todas tienen política'
              else 'REVISAR — sin política: ' || string_agg(c.relname, ', ') end
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = c.relname)

  union all

  -- 4) ¿El costo de compra está oculto a vendedores? REGLA: solo precios de venta.
  select 4, 'Costo oculto a vendedores',
         case when has_column_privilege('authenticated', 'productos', 'costo_unitario', 'SELECT')
              then 'FALLA — un vendedor puede leer costo_unitario y deducir el margen'
              else 'OK — costo protegido por permiso de columna' end

  union all

  -- 5) ¿El usuario anónimo puede leer finanzas o auditoría?
  select 5, 'Acceso anónimo',
         case when count(*) = 0 then 'OK — anon sin lectura de finanzas'
              else 'REVISAR — anon con SELECT en: ' || string_agg(table_name, ', ') end
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public' and privilege_type = 'SELECT'
    and table_name in ('gastos','trabajadores','ventas_asignadas','auditoria')

  union all

  -- 6) ¿La auditoría es inmutable? Nadie debe poder editar ni borrar su rastro.
  select 6, 'Auditoría inmutable',
         case when count(*) = 0 then 'OK — no se puede editar ni borrar'
              else 'FALLA — existe política de ' || string_agg(distinct cmd, '/') end
  from pg_policies
  where schemaname = 'public' and tablename = 'auditoria' and cmd in ('UPDATE','DELETE')

  union all

  -- 7) ¿Cuántas tablas y políticas quedaron? (informativo)
  select 7, 'Resumen',
         (select count(*)::text from pg_class
          where relnamespace = 'public'::regnamespace and relkind = 'r')
         || ' tablas · '
         || (select count(*)::text from pg_policies where schemaname = 'public')
         || ' políticas'
  union all

  -- 8) El Owner es irrevocable: existe la funcion puede() y el trigger que
  --    impide desactivarlo. Sin esto, alguien puede dejar el sistema sin dueno.
  select 8, 'Owner irrevocable',
         case when exists (select 1 from pg_proc where proname = 'puede')
               and exists (select 1 from pg_trigger where tgname = 'trg_owner_activo')
              then 'OK — funcion puede() y trigger presentes'
              else 'FALLA — falta la funcion o el trigger' end

  union all

  -- 9) Las alertas se agrupan. Sin el indice, cada intento crearia una fila
  --    nueva y el Owner recibiria decenas de alertas por lo mismo.
  select 9, 'Alertas agrupadas',
         case when exists (select 1 from pg_indexes
                           where schemaname = 'public' and indexname = 'notif_grupo_abierto')
              then 'OK — indice de agrupacion presente'
              else 'FALLA — sin indice: una alerta por cada intento' end

  union all

  -- 10) para_rol se respeta. Existia y ninguna politica la consultaba: una
  --     alerta "solo Owner" la veia cualquier administrador.
  select 10, 'para_rol respetada',
         case when exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'notificaciones'
                             and policyname = 'notificaciones_lectura'
                             and qual like '%para_rol%')
              then 'OK — la politica consulta para_rol'
              else 'FALLA — para_rol sigue siendo decorativa' end

)
select prueba, resultado from pruebas order by n;
