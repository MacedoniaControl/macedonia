-- ============================================================================
-- MACEDONIA — Row Level Security
-- Ejecutar DESPUÉS de 01-schema.sql
--
-- Aquí vive la SEGURIDAD REAL. Hoy los permisos están en el front
-- (lib/ux/session.ts) y eso es solo estructura: cualquiera con la consola del
-- navegador podría saltárselo. Estas políticas se aplican EN LA BASE, así que
-- aunque el front tenga un bug, los datos siguen protegidos.
--
-- REGLAS DE NEGOCIO QUE SE HACEN CUMPLIR:
--   · Pared entre empresas: nadie ve datos de otra empresa. Excepto OWNER.
--   · Registros / logs / auditoría: SOLO OWNER (ni siquiera los admins).
--   · Gastos y utilidad: OWNER + ADMIN.
--   · Vendedores: operan documentos e inventario, NO ven finanzas.
--   · Técnicos: solo su empresa, alcance operativo.
-- ============================================================================

-- ---------------------------------------------------------------- HELPERS
-- Funciones estables que leen el rol/empresa del usuario autenticado.
create or replace function auth_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from usuarios where id = auth.uid() and activo
$$;

create or replace function auth_empresa() returns text
language sql stable security definer set search_path = public as $$
  select empresa_id from usuarios where id = auth.uid() and activo
$$;

create or replace function es_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'owner' from usuarios where id = auth.uid() and activo), false)
$$;

-- ¿Puede ver/tocar esta empresa? Owner: todas. Los demás: solo la suya.
create or replace function puede_empresa(e text) returns boolean
language sql stable security definer set search_path = public as $$
  select es_owner() or coalesce(auth_empresa() = e, false)
$$;

-- Finanzas (gastos, utilidad, comisiones): owner + admin
create or replace function puede_finanzas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('owner','admin') from usuarios where id = auth.uid() and activo), false)
$$;

-- ---------------------------------------------------------------- ACTIVAR RLS
alter table empresas               enable row level security;
alter table usuarios               enable row level security;
alter table productos              enable row level security;
alter table importaciones          enable row level security;
alter table movimientos_inventario enable row level security;
alter table documentos             enable row level security;
alter table documento_lineas       enable row level security;
alter table notas_fiscales         enable row level security;
alter table fiscal_tx              enable row level security;
alter table gastos                 enable row level security;
alter table trabajadores           enable row level security;
alter table ventas_asignadas       enable row level security;
alter table notificaciones         enable row level security;
alter table auditoria              enable row level security;
alter table tasa_bcv               enable row level security;

-- ---------------------------------------------------------------- EMPRESAS
create policy empresas_lectura on empresas
  for select using (es_owner() or id = auth_empresa());
create policy empresas_owner_escribe on empresas
  for all using (es_owner()) with check (es_owner());

-- ---------------------------------------------------------------- USUARIOS
-- Cada quien se ve a sí mismo; el owner ve todos; el admin ve los de su empresa.
create policy usuarios_lectura on usuarios
  for select using (id = auth.uid() or es_owner()
                    or (auth_rol() = 'admin' and empresa_id = auth_empresa()));
-- Solo el owner crea/edita usuarios y roles (decisión de Greeg).
create policy usuarios_owner_escribe on usuarios
  for all using (es_owner()) with check (es_owner());

-- ---------------------------------------------------------------- PRODUCTOS
create policy productos_lectura on productos
  for select using (puede_empresa(empresa_id));
create policy productos_escribe on productos
  for all using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'))
  with check (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------- IMPORTACIONES
-- Sube y borra el admin de la empresa (o el owner). Borrar revierte movimientos.
create policy importaciones_lectura on importaciones
  for select using (puede_empresa(empresa_id));
create policy importaciones_escribe on importaciones
  for all using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'))
  with check (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------- KARDEX
create policy movimientos_lectura on movimientos_inventario
  for select using (puede_empresa(empresa_id));
-- Vendedores y técnicos SÍ generan movimientos (entregas, recargas).
create policy movimientos_inserta on movimientos_inventario
  for insert with check (puede_empresa(empresa_id));
-- Corregir/borrar un movimiento: solo owner y admin.
create policy movimientos_corrige on movimientos_inventario
  for update using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));
create policy movimientos_borra on movimientos_inventario
  for delete using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------- DOCUMENTOS
create policy documentos_lectura on documentos
  for select using (puede_empresa(empresa_id));
create policy documentos_escribe on documentos
  for all using (puede_empresa(empresa_id))
  with check (puede_empresa(empresa_id));

create policy lineas_lectura on documento_lineas
  for select using (exists (select 1 from documentos d
                            where d.id = documento_id and puede_empresa(d.empresa_id)));
create policy lineas_escribe on documento_lineas
  for all using (exists (select 1 from documentos d
                         where d.id = documento_id and puede_empresa(d.empresa_id)))
  with check (exists (select 1 from documentos d
                      where d.id = documento_id and puede_empresa(d.empresa_id)));

-- ---------------------------------------------------------------- FISCAL
create policy notas_fiscales_lectura on notas_fiscales
  for select using (puede_empresa(empresa_id));
-- Regularizar afecta cifras fiscales: owner y admin.
create policy notas_fiscales_escribe on notas_fiscales
  for all using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'))
  with check (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));

create policy fiscal_tx_lectura on fiscal_tx
  for select using (exists (select 1 from notas_fiscales n
                            where n.id = nota_id and puede_empresa(n.empresa_id)));
create policy fiscal_tx_escribe on fiscal_tx
  for all using (exists (select 1 from notas_fiscales n
                         where n.id = nota_id and puede_empresa(n.empresa_id))
                 and auth_rol() in ('owner','admin'))
  with check (exists (select 1 from notas_fiscales n
                      where n.id = nota_id and puede_empresa(n.empresa_id))
              and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------- FINANZAS
-- "Es función de administración saber los números" (Greeg): owner + admin.
create policy gastos_finanzas on gastos
  for all using (puede_empresa(empresa_id) and puede_finanzas())
  with check (puede_empresa(empresa_id) and puede_finanzas());

create policy trabajadores_finanzas on trabajadores
  for all using (puede_empresa(empresa_id) and puede_finanzas())
  with check (puede_empresa(empresa_id) and puede_finanzas());

create policy ventas_asignadas_finanzas on ventas_asignadas
  for all using (puede_empresa(empresa_id) and puede_finanzas())
  with check (puede_empresa(empresa_id) and puede_finanzas());

-- ---------------------------------------------------------------- NOTIFICACIONES
create policy notificaciones_lectura on notificaciones
  for select using (puede_empresa(empresa_id)
                    and (para_usuario is null or para_usuario = auth.uid()
                         or auth_rol() in ('owner','admin')));
create policy notificaciones_inserta on notificaciones
  for insert with check (puede_empresa(empresa_id));
-- Aprobar/rechazar: owner y admin.
create policy notificaciones_resuelve on notificaciones
  for update using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------- AUDITORÍA
-- *** SOLO OWNER *** — decisión explícita: ni siquiera los administradores.
create policy auditoria_solo_owner on auditoria
  for select using (es_owner());
-- Cualquiera autenticado puede DEJAR rastro, nadie puede editarlo ni borrarlo.
create policy auditoria_inserta on auditoria
  for insert with check (auth.uid() is not null);

-- ---------------------------------------------------------------- TASA BCV
-- La leen todos; la escribe el servidor (service_role) o un admin.
create policy tasa_lectura on tasa_bcv
  for select using (auth.uid() is not null);
create policy tasa_escribe on tasa_bcv
  for insert with check (auth_rol() in ('owner','admin'));
