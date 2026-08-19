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
