-- 28 · Cilindros: nunca saldos negativos, y la fecha de Venezuela
--
-- Lo encontró la prueba completa de cilindros (25-09-2026). La app valida
-- antes de guardar, pero la base no:
--   · Una entrega de más llenos de los que hay dejaba la Rampa en negativo.
--   · Un retorno de más de lo que el cliente tiene lo dejaba debiendo −N.
--   · Corregir o eliminar un movimiento viejo podía dejar negativos.
--   · Dos entregas al mismo tiempo podían sacar el mismo cilindro dos veces.
--
-- Ahora, después de cada movimiento nuevo, corregido o eliminado, la base
-- revisa ese gas en esa empresa: ningún estado puede quedar negativo y ningún
-- cliente puede quedar debiendo menos de cero. Si pasa, no se guarda.
--
-- Y la fecha: el servidor está en UTC, así que un movimiento de las 9 p. m.
-- de Venezuela quedaba con la fecha de mañana.
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------- 1. UNO A LA VEZ POR GAS
-- Dos entregas simultáneas del mismo gas esperan una a la otra; la segunda ve
-- lo que sacó la primera.
create or replace function public.cil_mov_turno()
returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('cil_saldo:' || new.empresa_id || ':' || new.gas));
  return new;
end $$;

drop trigger if exists cil_mov_turno on public.cilindros_mov;
create trigger cil_mov_turno before insert or update on public.cilindros_mov
  for each row execute function public.cil_mov_turno();

-- ---------------------------------------------------------------- 2. NUNCA NEGATIVOS
create or replace function public.cil_mov_sin_negativos()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  -- Primero el cliente: su mensaje dice mejor qué pasó.
  -- Lo que cada cliente tiene de ese gas. Se revisa el cliente de la fila
  -- (y el anterior, si una corrección le cambió el nombre).
  for r in
    select m.cliente, sum(case when m.estado_hacia = 'en_cliente' then m.cantidad
                               when m.estado_desde = 'en_cliente' then -m.cantidad else 0 end)::integer as n
      from public.cilindros_mov m
     where m.empresa_id = new.empresa_id and m.gas = new.gas and m.eliminado_en is null
       and m.cliente is not null
       and m.cliente in (new.cliente, case when tg_op = 'UPDATE' then old.cliente end)
     group by m.cliente
    having sum(case when m.estado_hacia = 'en_cliente' then m.cantidad
                    when m.estado_desde = 'en_cliente' then -m.cantidad else 0 end) < 0
  loop
    raise exception 'No alcanza: % quedaría con % cilindro(s) de %. No puede devolver más de los que tiene.',
      r.cliente, r.n, new.gas;
  end loop;
  -- Saldo del parque de ese gas, por estado.
  for r in
    select t.estado, sum(t.d)::integer as n
      from (select m.estado_hacia as estado, m.cantidad as d from public.cilindros_mov m
             where m.empresa_id = new.empresa_id and m.gas = new.gas and m.eliminado_en is null and m.estado_hacia is not null
            union all
            select m.estado_desde, -m.cantidad from public.cilindros_mov m
             where m.empresa_id = new.empresa_id and m.gas = new.gas and m.eliminado_en is null and m.estado_desde is not null) t
     group by t.estado having sum(t.d) < 0
  loop
    raise exception 'No alcanza: quedarían % cilindro(s) de % en «%». Revisa la cantidad o registra primero el alta o el conteo.',
      r.n, new.gas, replace(r.estado::text, '_', ' ');
  end loop;

  return null;
end $$;

drop trigger if exists cil_mov_sin_negativos on public.cilindros_mov;
create trigger cil_mov_sin_negativos after insert or update on public.cilindros_mov
  for each row execute function public.cil_mov_sin_negativos();

-- ---------------------------------------------------------------- 3. FECHA DE VENEZUELA
alter table public.cilindros_mov
  alter column fecha set default ((now() at time zone 'America/Caracas')::date);

-- Los días que un cliente lleva con cilindros, también con la fecha de aquí.
create or replace function public.comodato_permitido()
returns table (empresa_id text, cliente text, gas text, en_poder integer, desde date, dias integer)
language sql stable security definer set search_path = public as $$
  select m.empresa_id, m.cliente, m.gas,
         sum(case when m.estado_hacia = 'en_cliente' then m.cantidad
                  when m.estado_desde = 'en_cliente' then -m.cantidad else 0 end)::integer,
         min(case when m.estado_hacia = 'en_cliente' then m.fecha end),
         ((now() at time zone 'America/Caracas')::date - min(case when m.estado_hacia = 'en_cliente' then m.fecha end))::integer
    from public.cilindros_mov m
   where m.cliente is not null and m.eliminado_en is null
     and m.empresa_id = any (public.empresas_permitidas()) and public.puede('cylinders')
   group by m.empresa_id, m.cliente, m.gas
  having sum(case when m.estado_hacia = 'en_cliente' then m.cantidad
                  when m.estado_desde = 'en_cliente' then -m.cantidad else 0 end) <> 0
$$;

-- ---------------------------------------------------------------- 4. COMPROBACIÓN
-- Debe decir 2 disparadores, la fecha de Caracas y 0 saldos negativos hoy.
select
  (select count(*) from pg_trigger where tgrelid = 'public.cilindros_mov'::regclass
     and tgname in ('cil_mov_turno', 'cil_mov_sin_negativos')) as disparadores,
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'cilindros_mov' and column_name = 'fecha') as fecha_por_defecto,
  (select count(*) from (
     select empresa_id, gas, estado, sum(d) from (
       select empresa_id, gas, estado_hacia as estado, cantidad as d from public.cilindros_mov where estado_hacia is not null and eliminado_en is null
       union all
       select empresa_id, gas, estado_desde, -cantidad from public.cilindros_mov where estado_desde is not null and eliminado_en is null) t
     group by 1, 2, 3 having sum(d) < 0) q) as saldos_negativos_hoy;
