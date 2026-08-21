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
