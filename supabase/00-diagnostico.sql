-- ============================================================================
-- ¿QUE HAY YA EN LA BASE?  Ejecutar ANTES de instalar nada.
-- No modifica nada: solo mira. Una sola consulta, todo en un resultado.
-- ============================================================================
select 'TABLAS' as que, coalesce(string_agg(relname, ', ' order by relname), '(ninguna)') as detalle
from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
union all
select 'VISTAS', coalesce(string_agg(relname, ', ' order by relname), '(ninguna)')
from pg_class where relnamespace = 'public'::regnamespace and relkind = 'v'
union all
select 'TIPOS', coalesce(string_agg(typname, ', ' order by typname), '(ninguno)')
from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e'
union all
select 'FUNCIONES', coalesce(string_agg(proname, ', ' order by proname), '(ninguna)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all
select 'POLITICAS', coalesce(count(*)::text, '0') from pg_policies where schemaname = 'public'
union all
select 'FILAS CON DATOS', coalesce(string_agg(rel || '=' || cnt::text, ', '), '(vacio)')
from (
  select c.relname as rel, (select count(*) from pg_class x where x.oid = c.oid) * 0
         + coalesce(c.reltuples::bigint, 0) as cnt
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.reltuples > 0
) s;
