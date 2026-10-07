-- 38 · Eliminar cuentas por cobrar y por pagar
--
-- Botón «Eliminar» en Cuentas por Cobrar y Cuentas por Pagar. Borra la cuenta
-- y sus abonos de verdad: NO queda registro (pedido del usuario, 07-10-2026).
-- Las fotos del documento y de los abonos se borran del bucket desde la app
-- con las rutas que devuelve la función.
--
--   · Lo usan el Owner y un Administrador.
--   · El Owner lo habilita o deshabilita por empresa (configuración
--     «eliminar_cuentas»: «si» / «no»). Solo el Owner puede cambiar ese ajuste;
--     la base lo impide a cualquier otro aunque edite la configuración.
--     Arranca habilitado en las dos empresas.
--   · No se elimina una cuenta que está en una liquidación vigente: la
--     liquidación quedaría con abonos que no existen. Primero se anula.
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------- 1. EL AJUSTE: SOLO EL OWNER
create or replace function public.config_solo_owner()
returns trigger
language plpgsql as $$
declare
  privilegiado boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
  v_clave text := coalesce(new.clave, old.clave);
begin
  if v_clave = 'eliminar_cuentas' and not privilegiado and coalesce(public.auth_rol()::text, '') <> 'owner' then
    raise exception 'Habilitar o deshabilitar «Eliminar» lo hace el Owner.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists config_solo_owner on public.configuracion;
create trigger config_solo_owner before insert or update or delete on public.configuracion
  for each row execute function public.config_solo_owner();

-- Arranca habilitado en las dos empresas.
insert into public.configuracion (empresa_id, clave, valor)
select e.id, 'eliminar_cuentas', 'si' from public.empresas e
on conflict (empresa_id, clave) do nothing;

-- ---------------------------------------------------------------- 2. ELIMINAR
-- Devuelve cuántas cuentas se borraron y las rutas de sus fotos (para borrarlas
-- del bucket). Todo junto: si una no se puede, no se borra ninguna.
create or replace function public.eliminar_cuentas(p_empresa text, p_ids bigint[])
returns table (cuentas integer, rutas text[])
language plpgsql security definer set search_path = public as $$
declare
  v_n     integer;
  v_lq    text;
  v_rutas text[];
begin
  if not (public.puede_empresa(p_empresa) and public.puede_finanzas()) then
    raise exception 'Eliminar cuentas lo hacen el Owner o un Administrador.';
  end if;
  if coalesce((select valor from public.configuracion where empresa_id = p_empresa and clave = 'eliminar_cuentas'), 'si') = 'no' then
    raise exception 'El Owner deshabilitó «Eliminar» en esta empresa.';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Elige al menos una cuenta.';
  end if;

  perform 1 from public.cuentas c where c.id = any (p_ids) for update;
  select count(*) into v_n from public.cuentas c where c.id = any (p_ids);
  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguna de las cuentas ya no existe.';
  end if;
  if exists (select 1 from public.cuentas c where c.id = any (p_ids) and c.empresa_id <> p_empresa) then
    raise exception 'Todas las cuentas tienen que ser de esta empresa.';
  end if;
  if exists (select 1 from public.cuentas c where c.id = any (p_ids)
              and not ((c.tipo = 'cobrar' and public.puede('receivables')) or (c.tipo = 'pagar' and public.puede('payables')))) then
    raise exception 'No tienes acceso a una de esas carteras.';
  end if;

  select string_agg(distinct l.numero || ' (' || c.documento || ')', ', ') into v_lq
    from public.abonos a
    join public.liquidaciones l on l.id = a.liquidacion_id and l.anulada_en is null
    join public.cuentas c on c.id = a.cuenta_id
   where a.cuenta_id = any (p_ids);
  if v_lq is not null then
    raise exception 'Están en una liquidación vigente: %. Anúlala primero.', v_lq;
  end if;

  -- Las fotos de la cuenta y de sus abonos (no las de una liquidación, que son de ella).
  select array_agg(distinct r) into v_rutas from (
    select c.imagen_ruta r from public.cuentas c where c.id = any (p_ids) and c.imagen_ruta is not null
    union
    select a.imagen_ruta from public.abonos a where a.cuenta_id = any (p_ids) and a.imagen_ruta is not null
       and not exists (select 1 from public.liquidaciones l where l.imagen_ruta = a.imagen_ruta)
  ) f;

  delete from public.abonos a where a.cuenta_id = any (p_ids);
  delete from public.cuentas c where c.id = any (p_ids);
  get diagnostics v_n = row_count;
  return query select v_n, coalesce(v_rutas, '{}'::text[]);
end $$;
revoke execute on function public.eliminar_cuentas(text, bigint[]) from public, anon;
grant execute on function public.eliminar_cuentas(text, bigint[]) to authenticated;

-- ---------------------------------------------------------------- 3. COMPROBACIÓN
-- Debe decir: funcion 1, habilitado_en 2.
select
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'eliminar_cuentas') as funcion,
  (select count(*) from public.configuracion where clave = 'eliminar_cuentas' and valor = 'si') as habilitado_en;
