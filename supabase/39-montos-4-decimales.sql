-- 39 · Montos con 4 decimales: no se redondea a céntimos
--
-- «En dólares y bolívares debe admitirse un formato con 3 decimales como
-- mínimo; no puedes redondear cifras: es una herramienta administrativa»
-- (pedido del usuario, 07-10-2026).
--
-- Los montos se guardaban como numeric(14,2): un abono de $12,345 quedaba en
-- $12,35 al guardarse. Ahora todos van con 4 decimales, numeric(18,4), igual que
-- las tasas, los costos y los precios, que ya los tenían.
--
--   1. Toda columna numeric(14,2) del esquema public pasa a numeric(18,4).
--      Se buscan solas: también las que existan solo en producción. Los
--      porcentajes (numeric(5,2)) no se tocan.
--   2. Las vistas que leen esas columnas (o que redondean con ::numeric(14,2))
--      se guardan, se quitan y se vuelven a
--      crear tal cual (permisos, dueño, security_invoker y comentario
--      incluidos), cambiando sus ::numeric(14,2) por ::numeric(18,4).
--   3. liquidar_cuentas redondeaba el saldo a 2 decimales: ahora a 4.
--
-- Los montos que ya estaban guardados no cambian (12,35 sigue siendo 12,35);
-- desde ahora se guarda lo que se escriba, hasta el cuarto decimal.
-- Todo junto: si algo falla, no cambia nada. Se puede correr más de una vez.

begin;

do $$
declare
  v   record;
  c   record;
  a   record;
  def text;
begin
  -- ------------------------------------------------------------ las columnas
  create temp table _cols on commit drop as
  select cl.oid as tabla, n.nspname as esquema, cl.relname as nombre, at.attname as columna
    from pg_attribute at
    join pg_class cl on cl.oid = at.attrelid and cl.relkind in ('r', 'p')
    join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
   where at.attnum > 0 and not at.attisdropped
     and format_type(at.atttypid, at.atttypmod) = 'numeric(14,2)';

  -- ------------------------------------------------------------ las vistas que dependen de ellas (y las que dependen de esas)
  create temp table _vistas on commit drop as
  with recursive dep(vista, nivel) as (
    select distinct r.ev_class, 1
      from pg_depend d
      join pg_rewrite r on r.oid = d.objid and d.classid = 'pg_rewrite'::regclass
     where d.refclassid = 'pg_class'::regclass
       and d.refobjid in (select tabla from _cols)
       and r.ev_class not in (select tabla from _cols)
    union
    -- Las que redondean con ::numeric(14,2) aunque lean de una función
    -- (garantias_cliente lee de garantias_permitidas()).
    select cl.oid, 1
      from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and cl.relkind = 'v'
       and pg_get_viewdef(cl.oid) ~ 'numeric\(14,\s*2\)'
    union
    select r.ev_class, dep.nivel + 1
      from dep
      join pg_depend d on d.refobjid = dep.vista and d.refclassid = 'pg_class'::regclass and d.classid = 'pg_rewrite'::regclass
      join pg_rewrite r on r.oid = d.objid
     where r.ev_class <> dep.vista and dep.nivel < 20
  )
  select cl.oid, n.nspname as esquema, cl.relname as nombre, max(dep.nivel) as nivel,
         pg_get_viewdef(cl.oid, true) as definicion, cl.reloptions as opciones,
         pg_get_userbyid(cl.relowner) as dueno, cl.relacl as acl,
         obj_description(cl.oid, 'pg_class') as comentario
    from dep
    join pg_class cl on cl.oid = dep.vista and cl.relkind = 'v'
    join pg_namespace n on n.oid = cl.relnamespace
   group by cl.oid, n.nspname, cl.relname, cl.reloptions, cl.relowner, cl.relacl;

  -- Quitarlas: primero las que dependen de otras vistas.
  for v in select * from _vistas order by nivel desc loop
    execute format('drop view %I.%I', v.esquema, v.nombre);
  end loop;

  -- ------------------------------------------------------------ ampliar
  for c in select * from _cols order by nombre, columna loop
    execute format('alter table %I.%I alter column %I type numeric(18,4)', c.esquema, c.nombre, c.columna);
  end loop;

  -- ------------------------------------------------------------ volver a crear las vistas
  for v in select * from _vistas order by nivel asc loop
    def := regexp_replace(v.definicion, 'numeric\(14,\s*2\)', 'numeric(18,4)', 'g');
    execute format('create view %I.%I%s as %s', v.esquema, v.nombre,
      case when v.opciones is null then '' else ' with (' || array_to_string(v.opciones, ', ') || ')' end,
      def);
    execute format('alter view %I.%I owner to %I', v.esquema, v.nombre, v.dueno);
    if v.comentario is not null then
      execute format('comment on view %I.%I is %L', v.esquema, v.nombre, v.comentario);
    end if;
    -- Los permisos que tenía, uno por uno.
    execute format('revoke all on %I.%I from public', v.esquema, v.nombre);
    for a in select (aclexplode(v.acl)).* loop
      execute format('grant %s on %I.%I to %s', a.privilege_type, v.esquema, v.nombre,
        case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end);
    end loop;
  end loop;

  raise notice '% columnas ampliadas, % vistas recreadas', (select count(*) from _cols), (select count(*) from _vistas);
end $$;

-- ---------------------------------------------------------------- liquidar_cuentas: el saldo a 4 decimales
do $$
declare
  f   record;
  def text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = 'liquidar_cuentas'
  loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, 'where a.cuenta_id = c.id), 0), 2) as saldo', 'where a.cuenta_id = c.id), 0), 4) as saldo');
    def := regexp_replace(def, 'numeric\(14,\s*2\)', 'numeric(18,4)', 'g');
    execute def;
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: quedan_2_decimales 0, vistas_con_2 0, funciones_con_2 0.
select
  (select count(*) from pg_attribute at
     join pg_class cl on cl.oid = at.attrelid and cl.relkind in ('r', 'p')
     join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    where at.attnum > 0 and not at.attisdropped
      and format_type(at.atttypid, at.atttypmod) = 'numeric(14,2)') as quedan_2_decimales,
  (select count(*) from pg_views where schemaname = 'public' and definition ~ 'numeric\(14,\s*2\)') as vistas_con_2,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and (p.prosrc ~ 'numeric\(14,\s*2\)' or p.prosrc ~ '\), 0\), 2\) as saldo')) as funciones_con_2;
