-- ============================================================================
-- MACEDONIA — Datos base. Ejecutar DESPUÉS de 01-schema.sql y 02-rls.sql
-- ============================================================================

-- Empresas
insert into empresas (id, nombre, nombre_corto, rif, direccion, color) values
  ('sumigases', 'Sumigases Oriente, C.A.', 'Sumigases', 'J-502789510',   'Av. Bolívar, Lechería, Anzoátegui', '#b04e15'),
  ('sudematin', 'Sudematin & GM, C.A.',    'Sudematin', 'J-31697141-4',  'Cumaná, Sucre',                     '#2a2a8c')
on conflict (id) do nothing;

-- Catálogo de partidas de gasto (extraído del Estado de Resultado real).
-- Se guarda como tabla para que Admin/Owner puedan agregar partidas nuevas.
create table if not exists partidas_gasto (
  nombre    text primary key,
  categoria text not null,
  activa    boolean not null default true
);
alter table partidas_gasto enable row level security;
create policy partidas_lectura on partidas_gasto for select using (auth.uid() is not null);
create policy partidas_escribe on partidas_gasto for all
  using (auth_rol() in ('owner','admin')) with check (auth_rol() in ('owner','admin'));

insert into partidas_gasto (nombre, categoria) values
  ('Alquiler tienda', 'Alquileres'),
  ('Actualizaciones, permisologías e informes', 'Gastos operativos'),
  ('Aparatos o dispositivos electrónicos', 'Gastos operativos'),
  ('Artículos de limpieza y suministros', 'Gastos operativos'),
  ('Artículos de oficina, papelería y consumibles', 'Gastos operativos'),
  ('Asistencia tecnológica', 'Gastos operativos'),
  ('Comida y refrigerios', 'Gastos operativos'),
  ('Consumo interno', 'Gastos operativos'),
  ('Dotación uniformes', 'Gastos operativos'),
  ('Gastos caja', 'Gastos operativos'),
  ('Gastos de publicidad', 'Gastos operativos'),
  ('Gastos médicos', 'Gastos operativos'),
  ('Gastos de representación', 'Gastos operativos'),
  ('Honorarios profesionales', 'Gastos operativos'),
  ('Implementos de seguridad e higiene', 'Gastos operativos'),
  ('Mantenimiento y reparación de tienda', 'Gastos operativos'),
  ('Otros gastos', 'Gastos operativos'),
  ('Pólizas', 'Gastos operativos'),
  ('Servicios contratados', 'Gastos operativos'),
  ('Gastos de vehículos', 'Gastos de vehículos'),
  ('Gastos de fletes', 'Gastos de vehículos'),
  ('Nómina directores', 'Sueldos, salarios y comisiones'),
  ('Nómina personal administrativo y operativo', 'Sueldos, salarios y comisiones'),
  ('Comisiones vendedores', 'Sueldos, salarios y comisiones'),
  ('Liquidación', 'Sueldos, salarios y comisiones'),
  ('Vacaciones', 'Sueldos, salarios y comisiones'),
  ('Utilidades', 'Sueldos, salarios y comisiones'),
  ('FAOV', 'Sueldos, salarios y comisiones'),
  ('IVSS', 'Sueldos, salarios y comisiones'),
  ('INCES', 'Sueldos, salarios y comisiones'),
  ('Alcaldía', 'Impuestos y gastos bancarios'),
  ('SENIAT', 'Impuestos y gastos bancarios'),
  ('Gastos bancarios', 'Impuestos y gastos bancarios'),
  ('Gastos IGTF', 'Impuestos y gastos bancarios')
on conflict (nombre) do nothing;
