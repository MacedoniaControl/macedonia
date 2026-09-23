-- ============================================================================
-- 24 · REGLAS DE SEGURIDAD QUE NO FRENAN EL INVENTARIO
--
-- Las politicas de movimientos_inventario y productos llamaban a
-- puede_empresa(empresa_id) y a puede('...') POR CADA FILA. Con 23.459
-- movimientos, eso son decenas de miles de llamadas por consulta, cada una
-- leyendo `usuarios`:
--
--     existencias, 1ra pagina    servicio 158 ms   ·   tecnico 4.908 ms
--     contar movimientos         servicio 145 ms   ·   tecnico > 8 s (cortada)
--
-- Pasado el limite de 8 segundos la base corta la consulta, y el Inventario
-- deja de cargar para cualquier usuario (medido el 23-09-2026).
--
-- El arreglo es el que recomienda Supabase: que el permiso se calcule UNA vez
-- por consulta y no una por fila. `(select f())` hace que Postgres lo evalue
-- una sola vez; las empresas permitidas se calculan con la MISMA regla de
-- siempre, puede_empresa(), asi que nadie gana ni pierde acceso.
--
-- Por que una funcion y no `empresa_id in (select id from empresas ...)`: la
-- politica de lectura de `empresas` no contempla el permiso "otra_empresa", y
-- esa subconsulta le quitaria a quien lo tiene los datos de la otra empresa.
--
-- Se puede correr mas de una vez.
-- ============================================================================

create or replace function public.empresas_permitidas()
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(e.id), '{}') from public.empresas e where public.puede_empresa(e.id)
$$;

-- ---------------------------------------------------------------- MOVIMIENTOS
drop policy if exists movimientos_lectura on public.movimientos_inventario;
create policy movimientos_lectura on public.movimientos_inventario
  for select using (
    empresa_id = any ((select public.empresas_permitidas()))
    and (select public.puede('inventory'))
  );

drop policy if exists movimientos_inserta on public.movimientos_inventario;
create policy movimientos_inserta on public.movimientos_inventario
  for insert with check (
    empresa_id = any ((select public.empresas_permitidas()))
    and (select public.puede('inventory'))
  );

-- ---------------------------------------------------------------- PRODUCTOS
drop policy if exists productos_lectura on public.productos;
create policy productos_lectura on public.productos
  for select using (
    empresa_id = any ((select public.empresas_permitidas()))
    and (select public.puede('products'))
  );

drop policy if exists productos_escribe on public.productos;
create policy productos_escribe on public.productos
  for all using (
    empresa_id = any ((select public.empresas_permitidas()))
    and (select public.puede('products'))
    and (select public.auth_rol()) in ('owner', 'admin')
  )
  with check (
    empresa_id = any ((select public.empresas_permitidas()))
    and (select public.puede('products'))
    and (select public.auth_rol()) in ('owner', 'admin')
  );

-- ---------------------------------------------------------------- COMPROBACION
-- Debe devolver las cuatro politicas, todas con empresas_permitidas.
select tablename, policyname,
       case when coalesce(qual, '') || coalesce(with_check, '') like '%empresas_permitidas%' then 'si' else 'NO' end as rapida
  from pg_policies
 where schemaname = 'public'
   and policyname in ('movimientos_lectura', 'movimientos_inserta', 'productos_lectura', 'productos_escribe')
 order by tablename, policyname;
