-- ============================================================================
-- CONFIGURACION POR EMPRESA
--
-- Hasta ahora vivia en localStorage, o sea que CADA PERSONA tenia la suya. Para
-- un color de tema da igual; para el IVA y la tasa del dolar no: dos vendedores
-- con IVA distinto emiten documentos con totales distintos por el mismo
-- producto, y nadie se entera hasta que el cliente reclama.
--
-- Formato clave/valor en vez de una columna por ajuste: agregar un ajuste nuevo
-- es insertar una fila, no migrar la tabla.
-- ============================================================================

create table if not exists configuracion (
  empresa_id text not null references empresas(id),
  clave      text not null,
  valor      text not null,
  actualizado_por uuid references usuarios(id),
  actualizado_en  timestamptz not null default now(),
  primary key (empresa_id, clave)
);

alter table configuracion enable row level security;

-- La lee cualquiera que entre a la empresa: el IVA lo necesita el vendedor para
-- calcular un total, no solo el administrador.
create policy config_lectura on configuracion
  for select using (puede_empresa(empresa_id));

-- La cambian owner y admin. Un vendedor que pudiera mover el IVA o la tasa
-- estaria cambiando el precio de todo sin pasar por nadie.
create policy config_escribe on configuracion
  for all using (puede_empresa(empresa_id) and puede('settings') and auth_rol() in ('owner','admin'))
  with check (puede_empresa(empresa_id) and puede('settings') and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------------------
-- Valores de arranque
-- ---------------------------------------------------------------------------
insert into configuracion (empresa_id, clave, valor) values
  ('sumigases', 'iva_pct',            '16'),
  ('sumigases', 'tasa_manual',        '0'),
  ('sumigases', 'dias_vencimiento_cotizacion', '3'),
  ('sumigases', 'alerta_comodato_dias', '60'),
  ('sudematin', 'iva_pct',            '16'),
  ('sudematin', 'tasa_manual',        '0'),
  ('sudematin', 'dias_vencimiento_cotizacion', '3'),
  ('sudematin', 'alerta_comodato_dias', '60')
on conflict (empresa_id, clave) do nothing;

-- tasa_manual en 0 significa "usar la tasa del BCV". Solo se pone un numero
-- distinto para forzar una tasa a mano, y conviene que sea evidente cuando pasa.
