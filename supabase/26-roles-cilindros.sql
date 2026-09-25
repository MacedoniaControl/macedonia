-- ============================================================================
-- 26 · CILINDROS CON LAS MISMAS REGLAS QUE EL INVENTARIO
--
-- Decisión del Owner (24-09-2026): Cilindros sigue las reglas del inventario.
--   · Registran operaciones (entregas, salidas, altas, cambios de estado) el
--     Técnico, el Administrador y el Owner. El Vendedor no.
--   · El historial de movimientos solo lo ven el Owner y el Administrador.
--   · Ellos corrigen o eliminan un movimiento. Eliminar deja la línea con
--     quién, cuándo y qué se eliminó, como un mensaje eliminado en WhatsApp.
--     Antes el Owner y el Administrador podían BORRAR un movimiento sin dejar
--     rastro (cil_mov_borra).
--
-- Los saldos del Parque y la Rampa se calculan de los movimientos: pasan a
-- una función que los lee por el Técnico, filtrada por empresa, para que él
-- siga viendo el parque sin ver el historial. Un movimiento eliminado deja de
-- contar en los saldos.
--
-- Se puede correr más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------- 1. QUIÉN OPERA
create or replace function public.puede_operar_cilindros() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('owner', 'admin', 'tecnico') from public.usuarios where id = auth.uid() and activo), false)
     and public.puede('cylinders')
$$;
revoke execute on function public.puede_operar_cilindros() from public, anon;
grant execute on function public.puede_operar_cilindros() to authenticated;

-- ---------------------------------------------------------------- 2. CORREGIDO Y ELIMINADO
alter table public.cilindros_mov
  add column if not exists editado_en       timestamptz,
  add column if not exists editado_nombre   text,
  -- Lo que cambió, acumulado: «cantidad 5 → 4 (Angie, 24-09-2026 15:30)».
  add column if not exists edicion          text,
  add column if not exists eliminado_en     timestamptz,
  add column if not exists eliminado_por    uuid references public.usuarios(id),
  add column if not exists eliminado_nombre text;

-- ---------------------------------------------------------------- 3. SALDOS SIN ABRIR EL HISTORIAL
create or replace function public.cilindros_saldo_permitido()
returns table (empresa_id text, gas text, estado public.estado_cilindro, cantidad integer)
language sql stable security definer set search_path = public as $$
  select t.empresa_id, t.gas, t.estado, sum(t.delta)::integer
    from (
      select m.empresa_id, m.gas, m.estado_hacia as estado, m.cantidad as delta
        from public.cilindros_mov m where m.estado_hacia is not null and m.eliminado_en is null
      union all
      select m.empresa_id, m.gas, m.estado_desde, -m.cantidad
        from public.cilindros_mov m where m.estado_desde is not null and m.eliminado_en is null
    ) t
   where t.empresa_id = any (public.empresas_permitidas()) and public.puede('cylinders')
   group by t.empresa_id, t.gas, t.estado
$$;
revoke execute on function public.cilindros_saldo_permitido() from public, anon;
grant execute on function public.cilindros_saldo_permitido() to authenticated;

create or replace view public.cilindros_saldo with (security_invoker = on) as
select empresa_id, gas, estado, cantidad from public.cilindros_saldo_permitido();

create or replace function public.comodato_permitido()
returns table (empresa_id text, cliente text, gas text, en_poder integer, desde date, dias integer)
language sql stable security definer set search_path = public as $$
  select m.empresa_id, m.cliente, m.gas,
         sum(case when m.estado_hacia = 'en_cliente' then m.cantidad
                  when m.estado_desde = 'en_cliente' then -m.cantidad else 0 end)::integer,
         min(case when m.estado_hacia = 'en_cliente' then m.fecha end),
         (current_date - min(case when m.estado_hacia = 'en_cliente' then m.fecha end))::integer
    from public.cilindros_mov m
   where m.cliente is not null and m.eliminado_en is null
     and m.empresa_id = any (public.empresas_permitidas()) and public.puede('cylinders')
   group by m.empresa_id, m.cliente, m.gas
  having sum(case when m.estado_hacia = 'en_cliente' then m.cantidad
                  when m.estado_desde = 'en_cliente' then -m.cantidad else 0 end) <> 0
$$;
revoke execute on function public.comodato_permitido() from public, anon;
grant execute on function public.comodato_permitido() to authenticated;

create or replace view public.comodato_cliente with (security_invoker = on) as
select empresa_id, cliente, gas, en_poder, desde, dias from public.comodato_permitido();

create or replace function public.garantias_permitidas()
returns table (empresa_id text, cliente text, saldo_usd numeric)
language sql stable security definer set search_path = public as $$
  select m.empresa_id, m.cliente, sum(m.deposito_usd)
    from public.cilindros_mov m
   where m.cliente is not null and m.eliminado_en is null
     and m.empresa_id = any (public.empresas_permitidas()) and public.puede('cylinders')
   group by m.empresa_id, m.cliente
  having sum(m.deposito_usd) <> 0
$$;
revoke execute on function public.garantias_permitidas() from public, anon;
grant execute on function public.garantias_permitidas() to authenticated;

-- saldo_usd con su tipo original (numeric(14,2)).
create or replace view public.garantias_cliente with (security_invoker = on) as
select empresa_id, cliente, saldo_usd::numeric(14,2) as saldo_usd from public.garantias_permitidas();

-- ---------------------------------------------------------------- 4. EL HISTORIAL: OWNER Y ADMINISTRADOR
drop policy if exists cil_mov_lectura on public.cilindros_mov;
create policy cil_mov_lectura on public.cilindros_mov for select using (
  public.puede_empresa(empresa_id) and (select public.puede('cylinders')) and (select public.puede_finanzas()));

drop policy if exists cil_mov_inserta on public.cilindros_mov;
create policy cil_mov_inserta on public.cilindros_mov for insert with check (
  public.puede_empresa(empresa_id) and (select public.puede_operar_cilindros()));

-- Corregir y eliminar pasan por sus funciones, que dejan constancia.
drop policy if exists cil_mov_corrige on public.cilindros_mov;
drop policy if exists cil_mov_borra on public.cilindros_mov;

create or replace function public.cil_mov_protegido()
returns trigger
language plpgsql as $$
declare
  privilegiado boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_op = 'DELETE' then
    raise exception 'Un movimiento de cilindros no se borra: se elimina desde el historial, y queda la línea de quién lo eliminó.';
  end if;
  if tg_op = 'UPDATE' and not privilegiado then
    raise exception 'Un movimiento de cilindros se corrige desde el historial, por el Owner o un Administrador.';
  end if;
  if tg_op = 'INSERT' and not privilegiado
     and (new.eliminado_en is not null or new.eliminado_por is not null or new.editado_en is not null or new.edicion is not null) then
    raise exception 'Un movimiento nuevo no llega corregido ni eliminado.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists cil_mov_protegido on public.cilindros_mov;
create trigger cil_mov_protegido before insert or update or delete on public.cilindros_mov
  for each row execute function public.cil_mov_protegido();

-- Los nombres de quien registró y autorizó, para leerlo sin cruzar tablas.
drop view if exists public.cilindros_historial;
create view public.cilindros_historial with (security_invoker = on) as
select m.id, m.empresa_id, m.fecha, m.created_at, m.gas, m.cantidad, m.estado_desde, m.estado_hacia,
       m.cliente, m.documento, m.nota, m.retirado_por, m.deposito_usd,
       (select u.nombre from public.usuarios u where u.id = m.usuario_id) as registro,
       (select u.nombre from public.usuarios u where u.id = m.autorizado_por) as autorizo,
       m.editado_en, m.editado_nombre, m.edicion, m.eliminado_en, m.eliminado_nombre
  from public.cilindros_mov m;

-- ---------------------------------------------------------------- 5. CORREGIR (Owner o Administrador)
-- Solo lo que se anota a mano: cantidad, cliente, documento, quién retiró y
-- la nota. El gas y los estados no cambian: un movimiento de otro gas u otro
-- estado es otro movimiento (se elimina este y se registra el correcto).
create or replace function public.editar_mov_cilindro(p_id bigint, p_cambios jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m        public.cilindros_mov%rowtype;
  v_quien  text := (select nombre from public.usuarios where id = auth.uid());
  v_cant   integer;
  v_cli    text;
  v_doc    text;
  v_ret    text;
  v_nota   text;
  v_diff   text := '';
begin
  select * into m from public.cilindros_mov where id = p_id for update;
  if not found or m.eliminado_en is not null then raise exception 'No existe ese movimiento.'; end if;
  if not (public.puede_empresa(m.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador corrige un movimiento de cilindros.';
  end if;

  v_cant := coalesce((p_cambios->>'cantidad')::integer, m.cantidad);
  v_cli  := case when p_cambios ? 'cliente'      then nullif(trim(p_cambios->>'cliente'), '')      else m.cliente end;
  v_doc  := case when p_cambios ? 'documento'    then nullif(trim(p_cambios->>'documento'), '')    else m.documento end;
  v_ret  := case when p_cambios ? 'retirado_por' then nullif(trim(p_cambios->>'retirado_por'), '') else m.retirado_por end;
  v_nota := case when p_cambios ? 'nota'         then nullif(trim(p_cambios->>'nota'), '')         else m.nota end;

  if v_cant <> m.cantidad then v_diff := v_diff || 'cantidad ' || m.cantidad || ' → ' || v_cant || '; '; end if;
  if v_cli is distinct from m.cliente then v_diff := v_diff || 'cliente «' || coalesce(m.cliente, '') || '» → «' || coalesce(v_cli, '') || '»; '; end if;
  if v_doc is distinct from m.documento then v_diff := v_diff || 'documento «' || coalesce(m.documento, '') || '» → «' || coalesce(v_doc, '') || '»; '; end if;
  if v_ret is distinct from m.retirado_por then v_diff := v_diff || 'retiró «' || coalesce(m.retirado_por, '') || '» → «' || coalesce(v_ret, '') || '»; '; end if;
  if v_nota is distinct from m.nota then v_diff := v_diff || 'nota corregida; '; end if;
  if v_diff = '' then return; end if;

  update public.cilindros_mov
     set cantidad = v_cant, cliente = v_cli, documento = v_doc, retirado_por = v_ret, nota = v_nota,
         editado_en = now(), editado_nombre = coalesce(v_quien, 'Un usuario'),
         edicion = coalesce(edicion || ' · ', '') || rtrim(v_diff, '; ') || ' (' || coalesce(v_quien, 'un usuario') || ', ' ||
                   to_char(now() at time zone 'America/Caracas', 'DD-MM-YYYY HH24:MI') || ')'
   where id = p_id;
end $$;
revoke execute on function public.editar_mov_cilindro(bigint, jsonb) from public, anon;
grant execute on function public.editar_mov_cilindro(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------- 6. ELIMINAR (Owner o Administrador)
-- La fila queda como la línea «Se eliminó … · Por … · fecha», y deja de contar
-- en los saldos del Parque y la Rampa.
create or replace function public.eliminar_mov_cilindro(p_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m        public.cilindros_mov%rowtype;
  v_quien  text := (select nombre from public.usuarios where id = auth.uid());
begin
  select * into m from public.cilindros_mov where id = p_id for update;
  if not found or m.eliminado_en is not null then raise exception 'No existe ese movimiento.'; end if;
  if not (public.puede_empresa(m.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador elimina un movimiento de cilindros.';
  end if;
  update public.cilindros_mov
     set eliminado_en = now(), eliminado_por = auth.uid(), eliminado_nombre = coalesce(v_quien, 'Un usuario')
   where id = p_id;
end $$;
revoke execute on function public.eliminar_mov_cilindro(bigint) from public, anon;
grant execute on function public.eliminar_mov_cilindro(bigint) to authenticated;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe devolver todo en «si».
select
  (select case when count(*) = 6 then 'si' else 'NO' end from information_schema.columns
    where table_schema = 'public' and table_name = 'cilindros_mov'
      and column_name in ('editado_en', 'editado_nombre', 'edicion', 'eliminado_en', 'eliminado_por', 'eliminado_nombre')) as columnas_listas,
  (select case when count(*) = 6 then 'si' else 'NO' end from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('puede_operar_cilindros', 'cilindros_saldo_permitido', 'comodato_permitido',
                                                 'garantias_permitidas', 'editar_mov_cilindro', 'eliminar_mov_cilindro')) as funciones_listas,
  (select case when count(*) = 2 then 'si' else 'NO' end from pg_policies
    where schemaname = 'public' and tablename = 'cilindros_mov') as politicas_listas,
  (select case when count(*) = 1 then 'si' else 'NO' end from information_schema.views
    where table_schema = 'public' and table_name = 'cilindros_historial') as historial_listo;
