-- ============================================================================
-- CORRECCIONES tras la verificación (pruebas 4 y 5 en rojo)
-- Ejecutar en el SQL Editor. Se puede repetir sin problema.
-- ============================================================================

-- ------------------------------------------------------------------ PRUEBA 4
-- FALLA: "un vendedor puede leer costo_unitario y deducir el margen"
--
-- POR QUE FALLO EL INTENTO ANTERIOR:
-- `revoke select (costo_unitario) ...` NO surte efecto si existe un GRANT SELECT
-- a nivel de TABLA: en Postgres el permiso de tabla cubre todas las columnas y el
-- revoke de una columna suelta se ignora en silencio. Supabase otorga SELECT de
-- tabla a `authenticated` por defecto, así que el revoke no hacía nada.
--
-- FORMA CORRECTA: quitar el permiso de TABLA y volver a otorgar COLUMNA POR
-- COLUMNA, salteando costo_unitario.
revoke select on productos from authenticated, anon;

grant select (
  id, empresa_id, codigo, nombre, unidad, unidad_alt,
  precio_unitario, es_cilindro, tag_duplicado, created_at
) on productos to authenticated;
-- costo_unitario queda FUERA a propósito.
-- Owner y admin lo obtienen por costos_productos(empresa), que verifica el rol.

-- CONSECUENCIA: `select *` sobre productos ahora FALLA para usuarios normales.
-- Hay que pedir las columnas explícitamente. Es a propósito.

-- ------------------------------------------------------------------ PRUEBA 5
-- REVISAR: "anon con SELECT en gastos, trabajadores, ventas_asignadas"
--
-- Hoy NO es una fuga: el RLS ya bloquea todas las filas para anon (sus políticas
-- exigen puede_finanzas(), que es falso sin sesión). Pero el permiso sobrante es
-- una red de seguridad de menos: si mañana alguien afloja una política por error,
-- esto sería la diferencia entre un bug y una filtración de las finanzas a
-- internet. Se quita por defensa en profundidad.
revoke select on gastos, trabajadores, ventas_asignadas, auditoria from anon;

-- Tampoco tiene por qué escribir nada.
revoke insert, update, delete on gastos, trabajadores, ventas_asignadas, auditoria from anon;
