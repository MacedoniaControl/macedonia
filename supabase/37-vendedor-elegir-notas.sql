-- 37 · Vendedor del cliente: elegir qué notas abiertas pasan a su cartera
--
-- Al asignar (o cambiar) el vendedor externo de un cliente había dos opciones:
-- sus notas abiertas pasan todas o se quedan todas. Ahora hay una tercera:
-- se eligen de una lista cuáles pasan.
--   · Las elegidas pasan al vendedor nuevo (o a la cartera propia) y desde ahí
--     siguen al cliente.
--   · Las demás abiertas del cliente se quedan donde estaban y quedan marcadas
--     en la cuenta: un cambio futuro del cliente no las arrastra.
-- Todo junto: si algo falla, no cambia nada. Lo hacen el Owner o un
-- Administrador (igual que asignar el vendedor del cliente, migración 36).
--
-- Se puede correr más de una vez.

create or replace function public.asignar_vendedor_cliente_notas(p_empresa text, p_cliente text, p_vendedor text, p_ids bigint[])
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ven   text := nullif(trim(p_vendedor), '');
  v_clave text := public.clave_cliente(p_cliente);
  v_ajena text;
  n       integer := 0;
begin
  if not (public.puede_empresa(p_empresa) and public.puede_finanzas() and public.puede('receivables')) then
    raise exception 'Asignar el vendedor de un cliente lo hacen el Owner o un Administrador.';
  end if;
  -- Solo notas abiertas de ESTE cliente en esta empresa.
  select string_agg(c.documento, ', ') into v_ajena
    from public.cuentas c
   where c.id = any (coalesce(p_ids, '{}'))
     and not (c.empresa_id = p_empresa and c.tipo = 'cobrar' and c.estado = 'abierta' and public.clave_cliente(c.contraparte) = v_clave);
  if v_ajena is not null then
    raise exception 'Estas notas no son abiertas de %: %.', trim(p_cliente), v_ajena;
  end if;

  -- El cliente queda con su vendedor (sin mover nada todavía).
  perform public.asignar_vendedor_cliente(p_empresa, p_cliente, v_ven, false);

  -- Las elegidas pasan y siguen al cliente.
  update public.cuentas c set vendedor_externo = v_ven, vendedor_fijo = false
   where c.id = any (coalesce(p_ids, '{}'));
  get diagnostics n = row_count;

  -- Las demás abiertas que seguían al cliente se quedan donde estaban, marcadas.
  update public.cuentas c set vendedor_fijo = true
   where c.empresa_id = p_empresa and c.tipo = 'cobrar' and c.estado = 'abierta' and not c.vendedor_fijo
     and public.clave_cliente(c.contraparte) = v_clave and not (c.id = any (coalesce(p_ids, '{}')));
  return n;
end $$;
revoke execute on function public.asignar_vendedor_cliente_notas(text, text, text, bigint[]) from public, anon;
grant execute on function public.asignar_vendedor_cliente_notas(text, text, text, bigint[]) to authenticated;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: funcion 1.
select count(*) as funcion from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where s.nspname = 'public' and p.proname = 'asignar_vendedor_cliente_notas';
