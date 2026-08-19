-- ============================================================================
-- MACEDONIA — VERIFICACIÓN DE SEGURIDAD
-- Ejecutar DESPUÉS de 01, 02 y 03.
--
-- No asume nada: le pregunta a la base si las reglas están puestas de verdad.
-- Cada consulta devuelve OK o FALLA. Si algo dice FALLA, NO cargues datos reales.
--
-- Existe porque los agujeros de seguridad de este tipo son silenciosos: las
-- tablas se ven protegidas y la fuga va por un costado (una vista, una columna,
-- un rol de más).
-- ============================================================================

-- 1) ¿TODAS las tablas tienen RLS activo?
--    Sin RLS, cualquier usuario autenticado lee la tabla entera.
select '1. RLS por tabla' as prueba,
       case when count(*) = 0 then 'OK — todas protegidas'
            else 'FALLA — sin RLS: ' || string_agg(relname, ', ') end as resultado
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
  and not relrowsecurity;

-- 2) ¿Alguna vista se salta el RLS?
--    Una vista SIN security_invoker corre con los privilegios de su dueño y
--    LEE TODO, ignorando el RLS de las tablas que consulta.
select '2. Vistas con security_invoker' as prueba,
       case when count(*) = 0 then 'OK — ninguna se salta el RLS'
            else 'FALLA — vistas peligrosas: ' || string_agg(relname, ', ') end as resultado
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'v'
  and coalesce(array_to_string(reloptions, ','), '') not like '%security_invoker=on%'
  and coalesce(array_to_string(reloptions, ','), '') not like '%security_invoker=true%';

-- 3) ¿Hay tablas con RLS pero SIN ninguna política?
--    RLS sin políticas = nadie lee nada (rompe la app). Es el error opuesto.
select '3. Tablas sin políticas' as prueba,
       case when count(*) = 0 then 'OK — todas tienen política'
            else 'REVISAR — sin política: ' || string_agg(c.relname, ', ') end as resultado
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname);

-- 4) ¿El costo de compra está oculto para vendedores y técnicos?
--    REGLA: "Vendedor: solo precios de venta".
select '4. Costo oculto a vendedores' as prueba,
       case when has_column_privilege('authenticated', 'productos', 'costo_unitario', 'SELECT')
            then 'FALLA — un vendedor puede leer costo_unitario y deducir el margen'
            else 'OK — costo protegido por permiso de columna' end as resultado;

-- 5) ¿El usuario anónimo (sin login) puede leer algo?
--    anon = cualquiera en internet con la clave pública. No debe ver NADA.
select '5. Acceso anónimo' as prueba,
       case when count(*) = 0 then 'OK — anon no tiene lectura directa'
            else 'REVISAR — anon con SELECT en: ' || string_agg(table_name, ', ') end as resultado
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and privilege_type = 'SELECT'
  and table_name in ('gastos','trabajadores','ventas_asignadas','auditoria');

-- 6) ¿La auditoría es inmutable?
--    Nadie debe poder editar ni borrar el rastro: solo insertar y (owner) leer.
select '6. Auditoría inmutable' as prueba,
       case when count(*) = 0 then 'OK — no se puede editar ni borrar'
            else 'FALLA — existe política de ' || string_agg(distinct cmd, '/') end as resultado
from pg_policies
where schemaname = 'public' and tablename = 'auditoria'
  and cmd in ('UPDATE', 'DELETE');

-- 7) Resumen de políticas por tabla (informativo, para revisar a ojo).
select '7. Políticas por tabla' as prueba,
       tablename || ': ' || string_agg(cmd, '/' order by cmd) as resultado
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
