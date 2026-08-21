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
