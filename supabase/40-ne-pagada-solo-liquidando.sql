-- 40 · Una nota de entrega por cobrar se da por pagada SOLO liquidándola
--
-- Pedido del usuario (07-10-2026): «para marcar una NE como pagada el sistema
-- debe pedirte que la liquides, y ahí se crea una liquidación; no debe poder
-- cambiarse el estado de una nota de entrega sin haberla liquidado». Y: «si un
-- solo pago liquida varias notas, una liquidación en conjunto con esas notas
-- dentro».
--
--   1. Un abono suelto que pagaría COMPLETA una nota de entrega por cobrar no
--      entra: hay que liquidarla (liquidar_cuentas crea la LQ con sus notas).
--      Los abonos parciales siguen permitidos.
--   2. Una nota de entrega por cobrar no pasa a «liquidada» si no está en una
--      liquidación vigente (ni «pago total» ni «cerrar con saldo» a mano).
--   3. Las notas de entrega por cobrar que ya estaban pagadas sin liquidación
--      reciben la suya: un pago (mismo cliente, fecha, método y referencia) es
--      una liquidación con todas las notas que pagó. Las que tienen el saldo
--      NEGATIVO (se abonó de más) no se tocan: hay que revisarlas.
--
-- liquidar_cuentas y anular_liquidacion siguen igual (corren como el dueño de
-- la base y no las frena esto). Se puede correr más de una vez.

begin;

-- ---------------------------------------------------------------- 1. EL ABONO QUE LA PAGA COMPLETA
create or replace function public.ne_abono_solo_liquidando()
returns trigger
language plpgsql as $$
declare
  privilegiado boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
  v       record;
  abonado numeric;
begin
  if privilegiado or new.liquidacion_id is not null then return new; end if;
  select c.tipo, c.clase, c.documento, c.monto, coalesce(c.iva_retenido, 0) as ret into v
    from public.cuentas c where c.id = new.cuenta_id;
  if v.tipo = 'cobrar' and v.clase = 'nota_entrega' then
    select coalesce(sum(a.monto), 0) into abonado from public.abonos a where a.cuenta_id = new.cuenta_id;
    if abonado + new.monto >= v.monto - v.ret - 0.00005 then
      raise exception 'Ese abono paga completa la %. Para darla por pagada, liquídala con «Liquidar»: queda en una liquidación.', v.documento;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ne_abono_solo_liquidando on public.abonos;
create trigger ne_abono_solo_liquidando before insert on public.abonos
  for each row execute function public.ne_abono_solo_liquidando();

-- ---------------------------------------------------------------- 2. EL ESTADO «LIQUIDADA»
create or replace function public.ne_pagada_solo_liquidando()
returns trigger
language plpgsql as $$
declare
  privilegiado boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if privilegiado then return new; end if;
  if new.tipo = 'cobrar' and new.clase = 'nota_entrega'
     and new.estado = 'liquidada' and old.estado is distinct from 'liquidada'
     and not exists (select 1 from public.abonos a
                       join public.liquidaciones l on l.id = a.liquidacion_id and l.anulada_en is null
                      where a.cuenta_id = new.id) then
    raise exception 'La % solo se da por pagada liquidándola (botón «Liquidar»).', new.documento;
  end if;
  return new;
end $$;

drop trigger if exists ne_pagada_solo_liquidando on public.cuentas;
create trigger ne_pagada_solo_liquidando before update of estado on public.cuentas
  for each row execute function public.ne_pagada_solo_liquidando();

-- ---------------------------------------------------------------- 3. LAS QUE YA ESTABAN PAGADAS
do $$
declare
  g      record;
  v_id   bigint;
  v_num  text;
  n_lq   integer := 0;
  n_ne   integer := 0;
begin
  -- Las notas de entrega por cobrar pagadas (saldo cero o cerradas) sin una
  -- liquidación vigente. Saldo negativo = se abonó de más: se dejan.
  create temp table _pagadas on commit drop as
  select c.id, c.empresa_id, c.contraparte, c.documento
    from public.cuentas c
   where c.tipo = 'cobrar' and c.clase = 'nota_entrega'
     and abs(c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0)) < 0.00005
     and not exists (select 1 from public.abonos a join public.liquidaciones l on l.id = a.liquidacion_id and l.anulada_en is null
                      where a.cuenta_id = c.id);

  -- Un pago = mismo cliente, fecha, método y referencia.
  for g in
    select p.empresa_id, upper(trim(p.contraparte)) as cliente, min(p.contraparte) as contraparte,
           a.fecha, coalesce(a.metodo, '') as metodo, coalesce(a.referencia, '') as referencia,
           array_agg(a.id order by a.id) as abonos, array_agg(distinct p.id) as cuentas,
           sum(a.monto) as total, min(a.imagen_ruta) as imagen
      from _pagadas p join public.abonos a on a.cuenta_id = p.id and a.liquidacion_id is null
     group by p.empresa_id, upper(trim(p.contraparte)), a.fecha, coalesce(a.metodo, ''), coalesce(a.referencia, '')
     order by a.fecha, min(a.id)
  loop
    v_num := public.numero_liquidacion(g.empresa_id);
    insert into public.liquidaciones (empresa_id, tipo, numero, contraparte, fecha, total, cuentas, metodo, referencia, nota, imagen_ruta, creado_por, creado_nombre)
    values (g.empresa_id, 'cobrar', v_num, g.contraparte, g.fecha, g.total, cardinality(g.cuentas),
            nullif(g.metodo, ''), nullif(g.referencia, ''), 'Pago registrado antes de las liquidaciones', g.imagen, null, 'Sistema')
    returning id into v_id;
    update public.abonos a set liquidacion_id = v_id where a.id = any (g.abonos);
    update public.cuentas c
       set estado = 'liquidada', liquidada_en = coalesce(c.liquidada_en, now()), liquidada_como = 'total',
           liquidada_nota = 'Liquidación ' || v_num
     where c.id = any (g.cuentas);
    n_lq := n_lq + 1; n_ne := n_ne + cardinality(g.cuentas);
  end loop;
  raise notice '% liquidaciones creadas para % notas', n_lq, n_ne;
end $$;

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: disparadores 2 y pagadas_sin_lq 0. sobrepagadas son las de saldo
-- negativo que se dejaron para revisar.
select
  (select count(*) from pg_trigger where tgname in ('ne_abono_solo_liquidando', 'ne_pagada_solo_liquidando')) as disparadores,
  (select count(*) from public.cuentas c
    where c.tipo = 'cobrar' and c.clase = 'nota_entrega'
      and (c.estado = 'liquidada'
           or abs(c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0)) < 0.00005)
      and not exists (select 1 from public.abonos a join public.liquidaciones l on l.id = a.liquidacion_id and l.anulada_en is null
                       where a.cuenta_id = c.id)) as pagadas_sin_lq,
  (select count(*) from public.cuentas c
    where c.tipo = 'cobrar' and c.clase = 'nota_entrega'
      and c.monto - coalesce(c.iva_retenido, 0) - coalesce((select sum(a.monto) from public.abonos a where a.cuenta_id = c.id), 0) < -0.00005) as sobrepagadas;
