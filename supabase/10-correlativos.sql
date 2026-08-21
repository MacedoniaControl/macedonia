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

  -- Si el par (empresa, tipo) no existe todavia, arranca en ARRANQUE y no en 1:
  -- un documento numerado 0000000001 anuncia que el sistema acaba de nacer.
  insert into correlativos (empresa_id, tipo, siguiente)
  values (p_empresa, p_tipo, 45200)
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
-- Macedonia arranca una numeracion PROPIA, no continua la de Valery.
--
-- Se eligio un rango ALTO (45.200 y siguientes) por dos razones:
--
--   1. Un documento que empieza en 0000000001 anuncia que el sistema es nuevo.
--      Arrancar alto se ve como una operacion en marcha, que es lo que es: las
--      empresas llevan anos operando, lo nuevo es la herramienta.
--
--   2. No choca con Valery. Valery va por 8.204 y avanza de a poco; 45.200 esta
--      lo bastante lejos como para que no se crucen en anos. Si se cruzaran,
--      conciliar seria un infierno: dos documentos distintos con el mismo numero
--      en dos sistemas distintos.
--
-- El formato NO cambia: 10 digitos con ceros a la izquierda, igual que Valery.
-- El documento impreso se ve exactamente igual.
--
-- Los tres tipos cambian juntos: si las notas arrancaran en 45.200 y las
-- cotizaciones siguieran en 2.243, la diferencia se notaria igual.
-- ---------------------------------------------------------------------------
insert into correlativos (empresa_id, tipo, siguiente) values
  ('sumigases', 'nota_entrega', 45200),
  ('sumigases', 'cotizacion',   45200),
  ('sumigases', 'devolucion',   45200),
  ('sudematin', 'nota_entrega', 45200),
  ('sudematin', 'cotizacion',   45200),
  ('sudematin', 'devolucion',   45200)
on conflict (empresa_id, tipo) do nothing;

-- Si la tabla ya existia con los valores viejos, esto la corrige.
-- Solo sube el numero, nunca lo baja: bajarlo repetiria correlativos ya usados.
update correlativos set siguiente = 45200
 where siguiente < 45200;

-- ---------------------------------------------------------------------------
-- COMPROBACION: dos llamadas seguidas deben dar numeros DISTINTOS y correlativos.
--   select siguiente_correlativo('sumigases','nota_entrega');  -- 0000045200
--   select siguiente_correlativo('sumigases','nota_entrega');  -- 0000045201
-- ---------------------------------------------------------------------------
