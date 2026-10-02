-- 33 · Liquidar varias notas de un cliente con un solo pago
--
-- Muchos clientes pagan varias notas de entrega juntas. El Owner o un
-- Administrador elige las notas, registra el pago una sola vez (fecha, método,
-- referencia y la foto o PDF del comprobante) y cada nota:
--   · recibe un abono por TODO su saldo (monto − IVA retenido − lo ya abonado);
--   · queda liquidada como «total»;
--   · y el total por cobrar baja en lo pagado.
-- Todo en una sola transacción: o se liquidan todas o ninguna.
--
-- Queda el registro de la liquidación (número LQ-AAAA-NNNNNN, quién, cuándo,
-- qué notas, comprobante). Si se hizo por error se ANULA con motivo: se
-- borran sus abonos, las notas vuelven a quedar abiertas y la liquidación
-- queda marcada como anulada (no se borra).
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------- 1. TABLA
create table if not exists public.liquidaciones (
  id             bigserial primary key,
  empresa_id     text not null references public.empresas(id),
  tipo           text not null default 'cobrar' check (tipo in ('cobrar', 'pagar')),
  numero         text not null unique,
  contraparte    text not null,
  fecha          date not null,
  total          numeric(14,2) not null check (total > 0),
  cuentas        integer not null,
  metodo         text,
  referencia     text,
  nota           text,
  imagen_ruta    text,
  creado_por     uuid references public.usuarios(id),
  creado_nombre  text not null,
  creado_en      timestamptz not null default now(),
  anulada_en     timestamptz,
  anulada_por    uuid references public.usuarios(id),
  anulada_nombre text,
  anulada_motivo text
);
create index if not exists liquidaciones_empresa on public.liquidaciones (empresa_id, tipo, creado_en desc);

alter table public.abonos add column if not exists liquidacion_id bigint references public.liquidaciones(id);
create index if not exists abonos_liquidacion on public.abonos (liquidacion_id) where liquidacion_id is not null;

-- La leen quienes ven la cartera. Se escribe solo con las funciones de abajo.
alter table public.liquidaciones enable row level security;
drop policy if exists liquidaciones_lectura on public.liquidaciones;
create policy liquidaciones_lectura on public.liquidaciones for select using (
  public.puede_empresa(empresa_id)
  and ((tipo = 'cobrar' and public.puede('receivables')) or (tipo = 'pagar' and public.puede('payables'))));
grant select on public.liquidaciones to authenticated;

-- ---------------------------------------------------------------- 2. NÚMERO
create or replace function public.numero_liquidacion(p_empresa text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  hoy   date := (now() at time zone 'America/Caracas')::date;
  clave text := 'liquidacion_' || to_char(hoy, 'YYYY');
  n     bigint;
begin
  insert into public.correlativos (empresa_id, tipo, siguiente) values (p_empresa, clave, 1)
  on conflict (empresa_id, tipo) do nothing;
  update public.correlativos set siguiente = siguiente + 1
   where empresa_id = p_empresa and tipo = clave
  returning siguiente - 1 into n;
  return 'LQ-' || to_char(hoy, 'YYYY') || '-' || lpad(n::text, 6, '0');
end $$;
revoke execute on function public.numero_liquidacion(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. LIQUIDAR
create or replace function public.liquidar_cuentas(
  p_empresa text, p_ids bigint[], p_fecha date, p_metodo text, p_referencia text, p_nota text, p_imagen_ruta text)
returns table (id bigint, numero text, total numeric, cuentas integer)
language plpgsql security definer set search_path = public as $$
declare
  hoy      date := (now() at time zone 'America/Caracas')::date;
  v_nom    text;
  v_id     bigint;
  v_num    text;
  v_total  numeric := 0;
  v_cli    text;
  v_n      integer;
  r        record;
begin
  if not (public.puede_empresa(p_empresa) and public.puede_finanzas() and public.puede('receivables')) then
    raise exception 'Liquidar cuentas lo hacen el Owner o un Administrador.';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Elige al menos una cuenta.';
  end if;
  if p_fecha is null or p_fecha > hoy then
    raise exception 'La fecha del pago no puede ser posterior a hoy.';
  end if;

  -- Las cuentas, bloqueadas: dos personas no pueden liquidar la misma a la vez.
  perform 1 from public.cuentas c where c.id = any (p_ids) for update;

  select count(*) into v_n from public.cuentas c where c.id = any (p_ids);
  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguna de las cuentas ya no existe.';
  end if;
  if exists (select 1 from public.cuentas c where c.id = any (p_ids) and (c.empresa_id <> p_empresa or c.tipo <> 'cobrar')) then
    raise exception 'Todas las cuentas tienen que ser por cobrar de esta empresa.';
  end if;
  select string_agg(c.documento, ', ') into v_cli from public.cuentas c where c.id = any (p_ids) and c.estado <> 'abierta';
  if v_cli is not null then
    raise exception 'Ya están liquidadas: %.', v_cli;
  end if;
  if (select count(distinct upper(trim(c.contraparte))) from public.cuentas c where c.id = any (p_ids)) > 1 then
    raise exception 'Las cuentas son de clientes distintos: una liquidación es de un solo cliente.';
  end if;
  select min(c.contraparte) into v_cli from public.cuentas c where c.id = any (p_ids);

  -- Lo que falta de cada una: monto − IVA retenido − lo ya abonado.
  create temporary table _l on commit drop as
  select c.id, c.documento,
         round(c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0), 2) as saldo
    from public.cuentas c where c.id = any (p_ids);
  select string_agg(l.documento, ', ') into v_num from _l l where l.saldo <= 0;
  if v_num is not null then
    raise exception 'No tienen saldo pendiente: %. Quítalas de la selección.', v_num;
  end if;
  select sum(l.saldo) into v_total from _l l;

  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();
  v_num := public.numero_liquidacion(p_empresa);
  insert into public.liquidaciones (empresa_id, tipo, numero, contraparte, fecha, total, cuentas, metodo, referencia, nota, imagen_ruta, creado_por, creado_nombre)
  values (p_empresa, 'cobrar', v_num, v_cli, p_fecha, v_total, v_n, nullif(trim(p_metodo), ''), nullif(trim(p_referencia), ''),
          nullif(trim(p_nota), ''), nullif(trim(p_imagen_ruta), ''), auth.uid(), coalesce(v_nom, 'Sin nombre'))
  returning liquidaciones.id into v_id;

  for r in select * from _l loop
    insert into public.abonos (cuenta_id, fecha, monto, metodo, referencia, imagen_ruta, usuario_id, liquidacion_id)
    values (r.id, p_fecha, r.saldo, nullif(trim(p_metodo), ''),
            concat_ws(' · ', v_num, nullif(trim(p_referencia), '')), nullif(trim(p_imagen_ruta), ''), auth.uid(), v_id);
    update public.cuentas c
       set estado = 'liquidada', liquidada_en = now(), liquidada_por = auth.uid(), liquidada_como = 'total',
           liquidada_nota = 'Liquidación ' || v_num || coalesce(' · ' || nullif(trim(p_nota), ''), '')
     where c.id = r.id;
  end loop;

  return query select v_id, v_num, v_total, v_n;
end $$;
revoke execute on function public.liquidar_cuentas(text, bigint[], date, text, text, text, text) from public, anon;
grant execute on function public.liquidar_cuentas(text, bigint[], date, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- 4. ANULAR
create or replace function public.anular_liquidacion(p_id bigint, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  l     public.liquidaciones%rowtype;
  v_nom text;
  n     integer;
begin
  select * into l from public.liquidaciones where liquidaciones.id = p_id for update;
  if not found then raise exception 'No existe la liquidación %.', p_id; end if;
  if not (public.puede_empresa(l.empresa_id) and public.puede_finanzas()) then
    raise exception 'Anular una liquidación lo hacen el Owner o un Administrador.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indica por qué se anula: queda en el registro.';
  end if;
  if l.anulada_en is not null then
    raise exception 'La liquidación % ya está anulada.', l.numero;
  end if;
  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();

  -- Las cuentas vuelven a quedar abiertas (solo las que cerró esta liquidación).
  update public.cuentas c
     set estado = 'abierta', liquidada_en = null, liquidada_por = null, liquidada_como = null, liquidada_nota = null
   where c.id in (select a.cuenta_id from public.abonos a where a.liquidacion_id = p_id)
     and c.estado = 'liquidada' and c.liquidada_nota like 'Liquidación ' || l.numero || '%';
  delete from public.abonos a where a.liquidacion_id = p_id;
  get diagnostics n = row_count;

  update public.liquidaciones
     set anulada_en = now(), anulada_por = auth.uid(), anulada_nombre = coalesce(v_nom, 'Sin nombre'), anulada_motivo = trim(p_motivo)
   where liquidaciones.id = p_id;
  return n;
end $$;
revoke execute on function public.anular_liquidacion(bigint, text) from public, anon;
grant execute on function public.anular_liquidacion(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 5. COMPROBACIÓN
-- Debe decir: tabla 1, columna 1, funciones 2.
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename = 'liquidaciones') as tabla,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'abonos' and column_name = 'liquidacion_id') as columna,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('liquidar_cuentas', 'anular_liquidacion')) as funciones;
