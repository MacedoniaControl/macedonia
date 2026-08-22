-- ============================================================================
-- CILINDROS  ·  modelo real
--
-- DECISIONES DEL NEGOCIO (Greeg, 2026-08-22):
--   · Se cuentan POR CANTIDAD, no por serie individual.
--   · Son de la EMPRESA: el cliente los tiene en comodato y hay que recuperarlos.
--   · Algunos gases se rellenan en planta y otros se compran llenos.
--   · El tecnico registra la entrega: cuantos llenos deja y cuantos vacios trae,
--     y NO tienen por que coincidir (puede dejar 5 y traer 3).
--   · Hoy NO se cobra deposito, pero se quiere cobrar: queda construido y en 0.
--
-- MISMO PRINCIPIO QUE EL KARDEX: no hay columnas de saldo. Se registran
-- movimientos y los saldos se CALCULAN. Una columna "llenos = 62" se
-- desincroniza al primer fallo a medias; una suma de movimientos siempre cuadra
-- con su propio historial y ademas explica como se llego a ese numero.
-- ============================================================================

create type estado_cilindro as enum
  ('lleno', 'vacio', 'en_cliente', 'en_llenado', 'fuera_servicio');

-- ---------------------------------------------------------------- GASES
create table if not exists gases (
  empresa_id  text not null references empresas(id),
  nombre      text not null,                    -- OXIGENO, ARGON, ACETILENO...
  -- true  = se rellena en planta propia (vacio -> en_llenado -> lleno)
  -- false = se compra lleno al proveedor
  se_rellena  boolean not null default false,
  -- Deposito por cilindro. HOY 0: no se cobra. Subirlo lo activa, sin tocar codigo.
  deposito_usd numeric(14,2) not null default 0,
  activo      boolean not null default true,
  primary key (empresa_id, nombre)
);

alter table gases enable row level security;
create policy gases_lectura on gases
  for select using (puede_empresa(empresa_id) and puede('cylinders'));
create policy gases_escribe on gases
  for all using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'))
  with check (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------- MOVIMIENTOS
create table if not exists cilindros_mov (
  id            bigserial primary key,
  empresa_id    text not null references empresas(id),
  fecha         date not null default current_date,
  gas           text not null,
  cantidad      integer not null check (cantidad > 0),
  estado_desde  estado_cilindro,       -- null = alta: entra al parque
  estado_hacia  estado_cilindro,       -- null = baja: sale del parque
  -- Obligatorio cuando el movimiento involucra a un cliente.
  cliente       text,
  -- Deposito cobrado o devuelto en ESTE movimiento. Hoy siempre 0.
  deposito_usd  numeric(14,2) not null default 0,
  documento     text,                  -- N° de nota de entrega que lo origino
  nota          text,
  usuario_id    uuid references usuarios(id),
  created_at    timestamptz not null default now(),

  -- Un movimiento que no cambia nada no es un movimiento.
  constraint algo_cambia check (estado_desde is distinct from estado_hacia),
  -- Si toca a un cliente, hay que saber quien es: sin nombre no se puede reclamar.
  constraint cliente_si_en_cliente check (
    (estado_desde is distinct from 'en_cliente' and estado_hacia is distinct from 'en_cliente')
    or (cliente is not null and length(trim(cliente)) > 0)
  ),
  foreign key (empresa_id, gas) references gases(empresa_id, nombre)
);

create index if not exists cil_mov_empresa_fecha on cilindros_mov (empresa_id, fecha desc);
create index if not exists cil_mov_cliente on cilindros_mov (empresa_id, cliente) where cliente is not null;

alter table cilindros_mov enable row level security;

create policy cil_mov_lectura on cilindros_mov
  for select using (puede_empresa(empresa_id) and puede('cylinders'));
-- Los tecnicos SI registran movimientos: es su trabajo diario.
create policy cil_mov_inserta on cilindros_mov
  for insert with check (puede_empresa(empresa_id) and puede('cylinders'));
-- Corregir o borrar: solo owner y admin.
create policy cil_mov_corrige on cilindros_mov
  for update using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));
create policy cil_mov_borra on cilindros_mov
  for delete using (puede_empresa(empresa_id) and auth_rol() in ('owner','admin'));

-- ---------------------------------------------------------------- SALDOS
-- Cuantos cilindros hay de cada gas en cada estado. Se calcula: lo que entro a
-- ese estado menos lo que salio de el.
create view cilindros_saldo with (security_invoker = on) as
select empresa_id, gas, estado, sum(delta)::integer as cantidad
from (
  select empresa_id, gas, estado_hacia as estado,  cantidad as delta
    from cilindros_mov where estado_hacia is not null
  union all
  select empresa_id, gas, estado_desde as estado, -cantidad as delta
    from cilindros_mov where estado_desde is not null
) t
group by empresa_id, gas, estado;

-- ---------------------------------------------------------------- COMODATO
-- Cuantos tiene cada cliente y desde cuando el mas viejo sin devolver.
create view comodato_cliente with (security_invoker = on) as
select empresa_id, cliente, gas,
       sum(case when estado_hacia = 'en_cliente' then cantidad
                when estado_desde = 'en_cliente' then -cantidad
                else 0 end)::integer as en_poder,
       min(case when estado_hacia = 'en_cliente' then fecha end) as desde,
       (current_date - min(case when estado_hacia = 'en_cliente' then fecha end))::integer as dias
from cilindros_mov
where cliente is not null
group by empresa_id, cliente, gas
having sum(case when estado_hacia = 'en_cliente' then cantidad
                when estado_desde = 'en_cliente' then -cantidad
                else 0 end) <> 0;

-- ---------------------------------------------------------------- GARANTIAS
-- Cuanto deposito tiene a favor cada cliente. Hoy da 0 en todo, porque no se
-- cobra: existe para que activarlo sea cambiar un numero, no escribir codigo.
create view garantias_cliente with (security_invoker = on) as
select empresa_id, cliente, sum(deposito_usd)::numeric(14,2) as saldo_usd
from cilindros_mov
where cliente is not null
group by empresa_id, cliente
having sum(deposito_usd) <> 0;

-- ---------------------------------------------------------------- GASES BASE
insert into gases (empresa_id, nombre, se_rellena, deposito_usd) values
  ('sumigases', 'OXIGENO',   false, 0),
  ('sumigases', 'ACETILENO', false, 0),
  ('sumigases', 'ARGON',     false, 0),
  ('sumigases', 'NITROGENO', false, 0),
  ('sudematin', 'OXIGENO',   false, 0),
  ('sudematin', 'ACETILENO', false, 0),
  ('sudematin', 'ARGON',     false, 0),
  ('sudematin', 'NITROGENO', false, 0)
on conflict (empresa_id, nombre) do nothing;

-- ⚠ se_rellena queda en false para los cuatro porque no sabemos cuales se
-- rellenan en planta. Hay que marcarlo antes de usar el paso de llenado:
--   update gases set se_rellena = true
--    where empresa_id = 'sumigases' and nombre in ('OXIGENO','NITROGENO');
