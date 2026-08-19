-- ============================================================================
-- MACEDONIA — INSTALACION COMPLETA DE LA BASE DE DATOS
-- Pegar TODO esto en: panel de Supabase -> SQL Editor -> New query -> Run
--
-- Contiene, en orden:
--   1) Esquema      16 tablas (15 + partidas_gasto) + vista existencias
--   2) Seguridad    RLS: 32 politicas (la pared entre empresas)
--   3) Semilla      las 2 empresas + 34 partidas de gasto
--   4) Verificacion 7 pruebas — TODAS deben decir OK
--
-- Al terminar, el resultado muestra las 7 filas de verificacion.
-- Si alguna dice FALLA, no cargues datos reales hasta resolverla.
-- ============================================================================


-- ####################  01-schema  ####################

-- ============================================================================
-- MACEDONIA / SUMICONTROL — Esquema Postgres (Supabase)
-- Ejecutar PRIMERO. Después: 02-rls.sql y 03-seed.sql
--
-- Deriva 1:1 de los tipos TypeScript que ya existen en lib/ux/*.ts
-- ============================================================================

-- ---------------------------------------------------------------- ENUMS
create type rol_usuario     as enum ('owner','admin','vendedor','tecnico');
create type direccion_mov   as enum ('entrada','salida');
create type origen_mov      as enum ('venta','compra','manual');
create type moneda_t        as enum ('USD','BS');
create type tipo_trabajador as enum ('junior','senior','otro');
create type tipo_doc_venta  as enum ('NET','FAC');
create type estado_nota     as enum ('pendiente','facturada');
create type tipo_fiscal_tx  as enum ('compra-fiscal','venta-fiscal');
create type estado_notif    as enum ('pendiente','aprobada','rechazada');

-- ---------------------------------------------------------------- EMPRESAS
create table empresas (
  id          text primary key,              -- 'sumigases' | 'sudematin'
  nombre      text not null,
  nombre_corto text not null,
  rif         text not null,
  direccion   text,
  color       text,                          -- color de marca (hex)
  logo_url    text,                          -- Storage; hoy va embebido en el front
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- USUARIOS
-- Extiende auth.users de Supabase. El rol vive AQUÍ, no en el cliente.
create table usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  rol         rol_usuario not null,
  -- NULL = acceso a todas las empresas (solo tiene sentido para owner)
  empresa_id  text references empresas(id),
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on usuarios (empresa_id);

-- ---------------------------------------------------------------- PRODUCTOS
-- Clave de negocio = código de Valery. OJO: es CASE SENSITIVE a propósito
-- ("6X8AT" y "6x8AT" son productos distintos en Valery).
create table productos (
  id            bigserial primary key,
  empresa_id    text not null references empresas(id),
  codigo        text not null,
  nombre        text not null,
  unidad        text,
  unidad_alt    text,
  costo_unitario numeric(14,4) not null default 0,
  precio_unitario numeric(14,4) not null default 0,
  es_cilindro   boolean not null default false,
  tag_duplicado boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index on productos (empresa_id, codigo);

-- ---------------------------------------------------------------- IMPORTACIONES
-- Cada archivo de Valery subido. Borrar la fila revierte sus movimientos (cascade).
create table importaciones (
  id           bigserial primary key,
  empresa_id   text not null references empresas(id),
  tipo         text not null,                -- 'ventas' | 'compras' | 'inventario'
  archivo      text not null,
  hash_archivo text not null,                -- evita subir dos veces el mismo archivo
  filas        int  not null default 0,
  periodo_desde date,
  periodo_hasta date,
  subido_por   uuid references usuarios(id),
  created_at   timestamptz not null default now(),
  unique (empresa_id, hash_archivo)
);

-- ---------------------------------------------------------------- KARDEX
-- INGRESO -> compras + ingresos manuales | SALIDA -> ventas + salidas manuales
create table movimientos_inventario (
  id            bigserial primary key,
  empresa_id    text not null references empresas(id),
  fecha         date not null,
  direccion     direccion_mov not null,
  origen        origen_mov not null,
  codigo        text not null,
  nombre        text not null,
  cantidad      numeric(14,3) not null check (cantidad > 0),
  motivo        text,
  documento     text,
  -- Si el movimiento vino de un archivo, borrarlo revierte el movimiento.
  importacion_id bigint references importaciones(id) on delete cascade,
  -- false = solo regulariza papeles, NO mueve el inventario físico real
  afecta_inventario_real boolean not null default true,
  usuario_id    uuid references usuarios(id),
  created_at    timestamptz not null default now(),
  -- Los movimientos manuales exigen motivo (regla de negocio)
  constraint manual_requiere_motivo
    check (origen <> 'manual' or (motivo is not null and length(trim(motivo)) > 0))
);
create index on movimientos_inventario (empresa_id, fecha);
create index on movimientos_inventario (empresa_id, codigo);
create index on movimientos_inventario (importacion_id);

-- IDEMPOTENCIA: un mismo renglón de un documento no puede entrar dos veces.
create unique index movimientos_unicos_por_documento
  on movimientos_inventario (empresa_id, origen, documento, codigo, fecha)
  where documento is not null and origen <> 'manual';

-- Existencia actual = suma del kardex (no se guarda un stock suelto que se desincronice).
-- *** security_invoker = on ES OBLIGATORIO ***
-- Sin esto la vista se ejecuta con los privilegios de SU DUEÑO (el rol que corrió
-- la migración) y SE SALTA EL RLS de movimientos_inventario. Cualquier usuario
-- autenticado — un técnico de Sudematin, un vendedor — podría leer el inventario
-- COMPLETO DE AMBAS EMPRESAS a través de la vista, con las tablas "protegidas".
-- Es la forma más silenciosa de romper la pared entre empresas.
create view existencias with (security_invoker = on) as
select empresa_id, codigo,
       sum(case when direccion = 'entrada' then cantidad else -cantidad end) as existencia,
       sum(case when direccion = 'entrada' and afecta_inventario_real then cantidad
                when direccion = 'salida'  and afecta_inventario_real then -cantidad
                else 0 end) as existencia_fisica
from movimientos_inventario
group by empresa_id, codigo;

-- ---------------------------------------------------------------- DOCUMENTOS
-- Notas de entrega y cotizaciones emitidas por Macedonia (NO fiscales).
create table documentos (
  id            bigserial primary key,
  empresa_id    text not null references empresas(id),
  tipo          text not null,               -- 'nota_entrega' | 'cotizacion' | 'devolucion'
  correlativo   text not null,
  fecha         date not null,
  cliente       text not null,
  cliente_rif   text,
  cliente_direccion text,
  moneda        moneda_t not null default 'USD',
  total_usd     numeric(14,2) not null default 0,
  costo_usd     numeric(14,2) not null default 0,
  estado        text not null default 'borrador',
  vendedor_id   uuid references usuarios(id),
  creado_por    uuid references usuarios(id),
  created_at    timestamptz not null default now(),
  unique (empresa_id, tipo, correlativo)
);
create index on documentos (empresa_id, fecha);

create table documento_lineas (
  id            bigserial primary key,
  documento_id  bigint not null references documentos(id) on delete cascade,
  codigo        text not null,
  descripcion   text not null,
  cantidad      numeric(14,3) not null,
  unidad        text,
  precio_usd    numeric(14,4) not null default 0,
  costo_usd     numeric(14,4) not null default 0,
  descuento_pct numeric(5,2) not null default 0
);
create index on documento_lineas (documento_id);

-- ---------------------------------------------------------------- REGULARIZACIÓN FISCAL
create table notas_fiscales (
  id             bigserial primary key,
  empresa_id     text not null references empresas(id),
  documento_id   bigint references documentos(id),
  numero         text not null,
  cliente        text not null,
  cliente_rif    text,
  fecha          date not null,
  estado         estado_nota not null default 'pendiente',
  flujo          char(1),                    -- 'A' directa | 'B' con compra previa
  factura_valery text,                       -- N° REAL de la factura ya subida a Valery
  compra_proveedor_factura text,
  compra_proveedor_nombre  text,
  compra_costo   numeric(14,2),
  created_at     timestamptz not null default now()
);

create table fiscal_tx (
  id            bigserial primary key,
  nota_id       bigint not null references notas_fiscales(id) on delete cascade,
  tipo          tipo_fiscal_tx not null,
  codigo        text not null,
  cantidad      numeric(14,3) not null,
  v_delta       numeric(14,3) not null default 0,   -- stock Valery
  s_delta       numeric(14,3) not null default 0,   -- stock propio
  m_delta       numeric(14,3) not null default 0,   -- maestro (físico real)
  afecta_inventario_real boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on fiscal_tx (nota_id);

-- ---------------------------------------------------------------- GASTOS
create table gastos (
  id            bigserial primary key,
  empresa_id    text not null references empresas(id),
  fecha         date not null,
  partida       text not null,
  categoria     text not null,               -- una de las 5 del Estado de Resultado
  monto         numeric(14,2) not null check (monto > 0),
  moneda        moneda_t not null default 'USD',
  tasa          numeric(14,4),               -- obligatoria si moneda = 'BS'
  monto_usd     numeric(14,2) not null,
  beneficiario  text,
  tipo_transaccion text,
  documento     text,
  nota          text,
  usuario_id    uuid references usuarios(id),
  created_at    timestamptz not null default now(),
  constraint bs_requiere_tasa
    check (moneda = 'USD' or (tasa is not null and tasa > 0))
);
create index on gastos (empresa_id, fecha);

-- ---------------------------------------------------------------- COMISIONES Y BONOS
create table trabajadores (
  id            bigserial primary key,
  empresa_id    text not null references empresas(id),
  usuario_id    uuid references usuarios(id),
  nombre        text not null,
  tipo          tipo_trabajador not null,
  pct_comision  numeric(5,2) not null default 0,
  pct_bono      numeric(5,2) not null default 0,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table ventas_asignadas (
  id            bigserial primary key,
  trabajador_id bigint not null references trabajadores(id) on delete cascade,
  empresa_id    text not null references empresas(id),
  tipo_doc      tipo_doc_venta not null,
  documento     text not null,
  fecha         date not null,
  monto_usd     numeric(14,2) not null check (monto_usd > 0),
  cliente       text,
  created_at    timestamptz not null default now(),
  -- Un documento NO puede pagar comisión dos veces
  unique (empresa_id, tipo_doc, documento)
);
create index on ventas_asignadas (trabajador_id, fecha);

-- ---------------------------------------------------------------- NOTIFICACIONES
create table notificaciones (
  id            bigserial primary key,
  empresa_id    text references empresas(id),
  tipo          text not null,
  titulo        text not null,
  mensaje       text not null,
  para_rol      rol_usuario,
  para_usuario  uuid references usuarios(id),
  estado        estado_notif not null default 'pendiente',
  payload       jsonb,
  resuelta_por  uuid references usuarios(id),
  created_at    timestamptz not null default now()
);
create index on notificaciones (empresa_id, estado);

-- ---------------------------------------------------------------- AUDITORÍA
-- Solo el OWNER la consulta (ver 02-rls.sql).
create table auditoria (
  id          bigserial primary key,
  empresa_id  text references empresas(id),
  usuario_id  uuid references usuarios(id),
  accion      text not null,                 -- 'crear' | 'editar' | 'eliminar' | 'aprobar'
  entidad     text not null,                 -- tabla afectada
  entidad_id  text,
  detalle     jsonb,
  created_at  timestamptz not null default now()
);
create index on auditoria (empresa_id, created_at desc);

-- ---------------------------------------------------------------- TASA BCV
-- Una sola verdad compartida (hoy vive en el navegador de cada usuario).
create table tasa_bcv (
  id          bigserial primary key,
  tasa        numeric(14,4) not null,
  fecha_valor date,
  fetched_at  timestamptz not null default now()
);
create index on tasa_bcv (fetched_at desc);

-- ####################  02-rls  ####################

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
-- Crear documentos: vendedores y técnicos también (es su trabajo diario).
create policy documentos_crea on documentos
  for insert with check (puede_empresa(empresa_id)
                         and auth_rol() in ('owner','admin','vendedor','tecnico'));
create policy documentos_edita on documentos
  for update using (puede_empresa(empresa_id)
                    and auth_rol() in ('owner','admin','vendedor'));
-- Borrar un documento emitido: SOLO owner y admin. Antes podía hacerlo cualquier
-- usuario de la empresa, incluido un técnico de recargas.
create policy documentos_borra on documentos
  for delete using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));

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
-- Cualquiera autenticado puede DEJAR rastro, nadie puede editarlo ni borrarlo
-- (no hay policy de UPDATE ni DELETE: el RLS niega por defecto = log inmutable).
--
-- usuario_id DEBE ser el del propio autor: sin esta condición cualquier usuario
-- podría insertar entradas atribuidas a OTRA persona. Como este log es la única
-- fuente de verdad del Owner sobre quién hizo qué, poder falsificar el autor lo
-- vuelve inservible como evidencia.
create policy auditoria_inserta on auditoria
  for insert with check (auth.uid() is not null and usuario_id = auth.uid());

-- ---------------------------------------------------------------- COSTOS (columna)
-- REGLA: "Vendedor: solo precios de venta". El RLS es por FILA, no por COLUMNA:
-- con solo RLS, un vendedor hace `select * from productos` y ve costo_unitario,
-- es decir el costo de compra y el margen real de la empresa.
--
-- Por eso el costo se protege con permisos de COLUMNA y se expone únicamente a
-- través de una función que verifica puede_finanzas() (owner + admin).
--
-- CONSECUENCIA PARA QUIEN ESCRIBA CODIGO: `select *` sobre productos FALLA.
-- Hay que listar las columnas explícitamente. Es a propósito: obliga a decidir
-- si de verdad se necesita el costo.
revoke select (costo_unitario) on productos from authenticated, anon;

create or replace function costos_productos(e text)
returns table (codigo text, costo numeric)
language sql stable security definer set search_path = public as $$
  select p.codigo, p.costo_unitario
  from productos p
  where p.empresa_id = e
    and puede_empresa(e)
    and puede_finanzas()
$$;

-- ---------------------------------------------------------------- TASA BCV
-- La leen todos; la escribe el servidor (service_role) o un admin.
create policy tasa_lectura on tasa_bcv
  for select using (auth.uid() is not null);
create policy tasa_escribe on tasa_bcv
  for insert with check (auth_rol() in ('owner','admin'));

-- ####################  03-seed  ####################

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

-- ####################  04-verificacion  ####################

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
