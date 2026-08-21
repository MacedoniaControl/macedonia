-- ============================================================================
-- CORRELATIVOS ATOMICOS
--
-- El numero de documento NO puede salir de un contador en el navegador: dos
-- vendedores que generan una nota en el mismo segundo sacarian el MISMO numero,
-- y saldrian dos documentos con el mismo correlativo hacia clientes distintos.
--
-- Aqui el numero lo entrega la base, y el UPDATE toma un bloqueo de fila: dos
-- peticiones simultaneas se atienden una despues de la otra, nunca a la vez.
-- ============================================================================

create table if not exists correlativos (
  empresa_id text   not null references empresas(id),
  tipo       text   not null,          -- 'nota_entrega' | 'cotizacion' | 'devolucion'
  siguiente  bigint not null,
  primary key (empresa_id, tipo)
);

alter table correlativos enable row level security;

create policy correlativos_lectura on correlativos
  for select using (puede_empresa(empresa_id));

-- Nadie escribe a mano: solo la funcion, que es security definer.
create policy correlativos_owner on correlativos
  for all using (es_owner()) with check (es_owner());

-- ---------------------------------------------------------------------------
-- Entrega el siguiente numero y lo reserva. Atomico.
-- ---------------------------------------------------------------------------
create or replace function siguiente_correlativo(p_empresa text, p_tipo text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  n bigint;
begin
  if not puede_empresa(p_empresa) then
    raise exception 'Sin acceso a la empresa %', p_empresa;
  end if;

  insert into correlativos (empresa_id, tipo, siguiente)
  values (p_empresa, p_tipo, 1)
  on conflict (empresa_id, tipo) do nothing;

  -- El UPDATE bloquea la fila hasta que termina la transaccion: el siguiente
  -- que pida un numero espera, en vez de llevarse el mismo.
  update correlativos
     set siguiente = siguiente + 1
   where empresa_id = p_empresa and tipo = p_tipo
   returning siguiente - 1 into n;

  return lpad(n::text, 10, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Numeros de arranque.
--
-- Los de Sumigases vienen de su numeracion real en Valery.
--
-- ATENCION: los de Sudematin son los MISMOS por ahora, porque no tenemos su
-- numeracion real. Antes de emitir el primer documento de Sudematin hay que
-- confirmarlos: un correlativo equivocado en un documento que va al cliente es
-- un problema de verdad, no un detalle.
-- ---------------------------------------------------------------------------
insert into correlativos (empresa_id, tipo, siguiente) values
  ('sumigases', 'nota_entrega', 8204),
  ('sumigases', 'cotizacion',   2243),
  ('sumigases', 'devolucion',    604),
  ('sudematin', 'nota_entrega', 8204),   -- ⚠ confirmar con Valery de Sudematin
  ('sudematin', 'cotizacion',   2243),   -- ⚠ confirmar
  ('sudematin', 'devolucion',    604)    -- ⚠ confirmar
on conflict (empresa_id, tipo) do nothing;

-- ---------------------------------------------------------------------------
-- COMPROBACION: dos llamadas seguidas deben dar numeros DISTINTOS y correlativos.
--   select siguiente_correlativo('sumigases','nota_entrega');  -- 0000008204
--   select siguiente_correlativo('sumigases','nota_entrega');  -- 0000008205
-- ---------------------------------------------------------------------------
