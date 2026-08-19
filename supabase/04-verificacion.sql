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
)
select prueba, resultado from pruebas order by n;
