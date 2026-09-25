-- Prueba de cilindros · PASO 1 de 3: crea la función de prueba.
-- La prueba corre como cada usuario real y al final DESHACE TODO: no deja
-- movimientos, conteos ni números gastados. Solo muestra resultados.
--   Paso 2 (consulta aparte):  select * from public.probar_cilindros_tmp();
--   Paso 3 (consulta aparte):  drop function public.probar_cilindros_tmp();
create or replace function public.probar_cilindros_tmp()
returns table (n integer, caso text, resultado text, detalle text)
language plpgsql as $prueba$
declare
  T uuid; T2 uuid; A uuid; O uuid; V uuid;
  casos text[] := '{}'; oks text[] := '{}'; dets text[] := '{}';
  x integer; y integer; l0 integer; v0 integer; c0 integer; m0 integer; t0 integer; ultimo bigint;
  e1 bigint; e2 bigint; e3 bigint; cid bigint; num text; lin jsonb; nota text;
begin
  select id into T  from public.usuarios where nombre = 'Almacén PLC';
  select id into T2 from public.usuarios where nombre = 'Almacén Cumaná';
  select id into A  from public.usuarios where nombre = 'Administración PLC';
  select id into O  from public.usuarios where nombre = 'Saúl Navarro';
  select id into V  from public.usuarios where nombre = 'Ventas PLC';
  select count(*) into m0 from public.cilindros_mov where empresa_id = 'sumigases';
  select coalesce(max(id), 0) into ultimo from public.cilindros_mov;
  select coalesce(sum(public.saldo_cilindro('sumigases', g.nombre, est.valor)), 0) into t0
    from public.gases g cross join unnest(enum_range(null::public.estado_cilindro)) est(valor) where g.empresa_id = 'sumigases';
  begin
-- ======== 1. QUIÉN VE QUÉ

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_saldo where empresa_id = 'sumigases';
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Técnico ve la Rampa (saldos)'::text; oks := oks || (case when x > 0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' fila(s)')::text, '');
  exception when others then casos := casos || 'Técnico ve la Rampa (saldos)'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_mov;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Técnico NO ve los movimientos'::text; oks := oks || (case when x = 0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' fila(s)')::text, '');
  exception when others then casos := casos || 'Técnico NO ve los movimientos'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_historial;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Técnico NO ve el historial'::text; oks := oks || (case when x = 0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' fila(s)')::text, '');
  exception when others then casos := casos || 'Técnico NO ve el historial'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_mov where empresa_id = 'sumigases';
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Administradora ve todos los movimientos'::text; oks := oks || (case when x = m0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' de ' || m0)::text, '');
  exception when others then casos := casos || 'Administradora ve todos los movimientos'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', O::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_mov where empresa_id = 'sumigases';
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Owner ve todos los movimientos'::text; oks := oks || (case when x = m0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' de ' || m0)::text, '');
  exception when others then casos := casos || 'Owner ve todos los movimientos'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', V::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_saldo; select count(*) into y from public.cilindros_mov;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Vendedor no ve cilindros'::text; oks := oks || (case when x = 0 and y = 0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' saldos, ' || y || ' movimientos')::text, '');
  exception when others then casos := casos || 'Vendedor no ve cilindros'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T2::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_saldo where empresa_id = 'sumigases';
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Técnico de Cumaná no ve Sumigases'::text; oks := oks || (case when x = 0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' fila(s)')::text, '');
  exception when others then casos := casos || 'Técnico de Cumaná no ve Sumigases'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', V::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_conteos;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Vendedor no ve conteos de Rampa'::text; oks := oks || (case when x = 0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' fila(s)')::text, '');
  exception when others then casos := casos || 'Vendedor no ve conteos de Rampa'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;
-- ======== 2. ENTREGAS Y RETORNOS (Técnico)
perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true); l0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno'); c0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'en_cliente'); v0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio');

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, cliente, autorizado_por, retirado_por) values ('sumigases', 'OXIGENO', 5, 'lleno', 'en_cliente', auth.uid(), 'CLIENTE PRUEBA MACEDONIA', A, 'Chofer prueba');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select max(id) into e1 from public.cilindros_mov;
    casos := casos || 'Entrega de 5 llenos a un cliente'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno') = l0 - 5 and public.saldo_cilindro('sumigases', 'OXIGENO', 'en_cliente') = c0 + 5 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('llenos ' || l0 || ' → ' || public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno') || ', en cliente ' || c0 || ' → ' || public.saldo_cilindro('sumigases', 'OXIGENO', 'en_cliente'))::text, '');
  exception when others then casos := casos || 'Entrega de 5 llenos a un cliente'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    select coalesce(sum(en_poder), 0) into x from public.comodato_cliente where cliente = 'CLIENTE PRUEBA MACEDONIA' and gas = 'OXIGENO';
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'El cliente figura con 5 en su poder'::text; oks := oks || (case when x = 5 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' en poder')::text, '');
  exception when others then casos := casos || 'El cliente figura con 5 en su poder'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, cliente, retirado_por) values ('sumigases', 'OXIGENO', 1, 'lleno', 'en_cliente', auth.uid(), 'CLIENTE PRUEBA MACEDONIA', 'Chofer');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Entrega sin autorizante'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Entrega sin autorizante'::text; oks := oks || (case when sqlerrm ~* 'salida_autorizada' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, cliente, autorizado_por) values ('sumigases', 'OXIGENO', 1, 'lleno', 'en_cliente', auth.uid(), 'CLIENTE PRUEBA MACEDONIA', A);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Entrega sin quién se los lleva'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Entrega sin quién se los lleva'::text; oks := oks || (case when sqlerrm ~* 'salida_autorizada' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, autorizado_por, retirado_por) values ('sumigases', 'OXIGENO', 1, 'lleno', 'en_cliente', auth.uid(), A, 'Chofer');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Entrega sin cliente'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Entrega sin cliente'::text; oks := oks || (case when sqlerrm ~* 'cliente_si_en_cliente' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'OXIGENO', 0, 'lleno', 'vacio', auth.uid());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Cantidad cero'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Cantidad cero'::text; oks := oks || (case when sqlerrm ~* 'check|cantidad' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'OXIGENO', 1, 'lleno', 'lleno', auth.uid());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Movimiento que no cambia nada'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Movimiento que no cambia nada'::text; oks := oks || (case when sqlerrm ~* 'algo_cambia' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'GAS INVENTADO', 1, 'vacio', 'en_llenado', auth.uid());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Gas que no existe'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Gas que no existe'::text; oks := oks || (case when sqlerrm ~* 'foreign key|violates' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, cliente) values ('sumigases', 'OXIGENO', 3, 'en_cliente', 'vacio', auth.uid(), 'CLIENTE PRUEBA MACEDONIA');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select max(id) into e2 from public.cilindros_mov;
    casos := casos || 'Retorno de 3 vacíos del cliente'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio') = v0 + 3 and public.saldo_cilindro('sumigases', 'OXIGENO', 'en_cliente') = c0 + 2 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('vacíos ' || v0 || ' → ' || public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio') || ', en cliente → ' || public.saldo_cilindro('sumigases', 'OXIGENO', 'en_cliente'))::text, '');
  exception when others then casos := casos || 'Retorno de 3 vacíos del cliente'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    select coalesce(sum(en_poder), 0) into x from public.comodato_cliente where cliente = 'CLIENTE PRUEBA MACEDONIA' and gas = 'OXIGENO';
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'El cliente queda con 2'::text; oks := oks || (case when x = 2 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' en poder')::text, '');
  exception when others then casos := casos || 'El cliente queda con 2'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, cliente, nota) values ('sumigases', 'OXIGENO', 1, null, 'vacio', auth.uid(), 'CLIENTE PRUEBA MACEDONIA', 'Retorno de cilindro(s) que no figuraban');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Vacío devuelto sin figurar (con cliente) entra al parque'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio') = v0 + 4 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Vacío devuelto sin figurar (con cliente) entra al parque'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'OXIGENO', 1, null, 'vacio', auth.uid());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Vacío suelto sin cliente (Técnico)'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Vacío suelto sin cliente (Técnico)'::text; oks := oks || (case when sqlerrm ~* 'row-level security' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, cliente) values ('sumigases', 'OXIGENO', 10, 'en_cliente', 'vacio', auth.uid(), 'CLIENTE PRUEBA MACEDONIA');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Cliente devuelve más de lo que tiene'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Cliente devuelve más de lo que tiene'::text; oks := oks || (case when sqlerrm ~* 'No alcanza: .* quedaría con -' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, cliente, autorizado_por, retirado_por) values ('sumigases', 'OXIGENO', 9999, 'lleno', 'en_cliente', auth.uid(), 'CLIENTE PRUEBA MACEDONIA', A, 'x');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Entrega de más llenos de los que hay'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Entrega de más llenos de los que hay'::text; oks := oks || (case when sqlerrm ~* 'No alcanza: quedarían -' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'OXIGENO', 9999, 'vacio', 'en_llenado', auth.uid());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Llenado de más vacíos de los que hay'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Llenado de más vacíos de los que hay'::text; oks := oks || (case when sqlerrm ~* 'No alcanza' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, cliente, autorizado_por, retirado_por) values
       ('sumigases', 'OXIGENO', 2, 'lleno', 'en_cliente', auth.uid(), 'CLIENTE PRUEBA DOS', A, 'Chofer'),
       ('sumigases', 'OXIGENO', 1, 'en_cliente', 'vacio', auth.uid(), 'CLIENTE PRUEBA DOS', null, null);
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Entrega y retorno en un mismo registro (visita normal)'::text; oks := oks || (case when (select coalesce(sum(en_poder), 0) from public.comodato_cliente where cliente = 'CLIENTE PRUEBA DOS') = 1 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(((select coalesce(sum(en_poder), 0) from public.comodato_cliente where cliente = 'CLIENTE PRUEBA DOS') || ' en poder')::text, '');
  exception when others then casos := casos || 'Entrega y retorno en un mismo registro (visita normal)'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;
-- ======== 3. CAMBIOS DE ESTADO, ALTAS Y BAJAS
perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true); l0 := public.saldo_cilindro('sumigases', 'ARGON', 'lleno'); v0 := public.saldo_cilindro('sumigases', 'ARGON', 'vacio');

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'ARGON', 1, 'vacio', 'en_llenado', auth.uid());
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Técnico manda 1 vacío a llenado'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'ARGON', 'vacio') = v0 - 1 and public.saldo_cilindro('sumigases', 'ARGON', 'en_llenado') >= 1 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Técnico manda 1 vacío a llenado'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'ARGON', 1, 'en_llenado', 'lleno', auth.uid());
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Técnico recibe el llenado como lleno'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'ARGON', 'lleno') = l0 + 1 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Técnico recibe el llenado como lleno'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, nota) values ('sumigases', 'ARGON', 1, 'lleno', 'fuera_servicio', auth.uid(), 'Válvula dañada');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Técnico pasa 1 lleno a fuera de servicio'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'ARGON', 'fuera_servicio') >= 1 and public.saldo_cilindro('sumigases', 'ARGON', 'lleno') = l0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Técnico pasa 1 lleno a fuera de servicio'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'ARGON', 3, null, 'lleno', auth.uid());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Técnico da de alta cilindros'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Técnico da de alta cilindros'::text; oks := oks || (case when sqlerrm ~* 'row-level security' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'ARGON', 1, 'lleno', null, auth.uid());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Técnico da de baja cilindros'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Técnico da de baja cilindros'::text; oks := oks || (case when sqlerrm ~* 'row-level security' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, eliminado_en) values ('sumigases', 'ARGON', 1, 'vacio', 'en_llenado', auth.uid(), now());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Técnico inserta un movimiento ya eliminado'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Técnico inserta un movimiento ya eliminado'::text; oks := oks || (case when sqlerrm ~* 'eliminado|row-level' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', V::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'ARGON', 1, 'vacio', 'en_llenado', auth.uid());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Vendedor registra un movimiento'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Vendedor registra un movimiento'::text; oks := oks || (case when sqlerrm ~* 'row-level security' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T2::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id) values ('sumigases', 'ARGON', 1, 'vacio', 'en_llenado', auth.uid());
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Técnico de Cumaná registra en Sumigases'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Técnico de Cumaná registra en Sumigases'::text; oks := oks || (case when sqlerrm ~* 'row-level security' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, nota) values ('sumigases', 'ARGON', 4, null, 'lleno', auth.uid(), 'Compra prueba') returning id into e3;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Administradora da de alta 4 llenos'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'ARGON', 'lleno') = l0 + 4 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Administradora da de alta 4 llenos'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', O::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, nota) values ('sumigases', 'ARGON', 1, 'lleno', null, auth.uid(), 'Baja prueba');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Owner da de baja 1 lleno'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'ARGON', 'lleno') = l0 + 3 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Owner da de baja 1 lleno'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;
-- ======== 4. CORREGIR Y ELIMINAR (historial)
perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true); l0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno'); c0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'en_cliente');

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform public.editar_mov_cilindro(e1, '{"cantidad": 4}'::jsonb);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Técnico corrige un movimiento'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Técnico corrige un movimiento'::text; oks := oks || (case when sqlerrm ~* 'Solo el Owner o un Administrador' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.editar_mov_cilindro(e1, '{"cantidad": 4, "documento": "NE-PRUEBA"}'::jsonb);
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Administradora corrige la entrega de 5 a 4'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno') = l0 + 1 and public.saldo_cilindro('sumigases', 'OXIGENO', 'en_cliente') = c0 - 1 and (select edicion ~ 'cantidad 5 → 4' from public.cilindros_mov where id = e1) then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(((select edicion from public.cilindros_mov where id = e1))::text, '');
  exception when others then casos := casos || 'Administradora corrige la entrega de 5 a 4'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.editar_mov_cilindro(e1, '{"cantidad": 0}'::jsonb);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Corregir a cantidad cero'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Corregir a cantidad cero'::text; oks := oks || (case when sqlerrm ~* 'check|cantidad' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.editar_mov_cilindro(e1, '{"cantidad": 9999}'::jsonb);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Corregir una entrega a 9999 (más de lo que hay)'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Corregir una entrega a 9999 (más de lo que hay)'::text; oks := oks || (case when sqlerrm ~* 'No alcanza' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.eliminar_mov_cilindro((select min(id) from public.cilindros_mov where empresa_id = 'sumigases' and gas = 'OXIGENO' and estado_desde is null and estado_hacia = 'lleno' and eliminado_en is null));
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Eliminar el alta inicial dejaría negativos'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Eliminar el alta inicial dejaría negativos'::text; oks := oks || (case when sqlerrm ~* 'No alcanza' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;
perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true); l0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno'); v0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio'); c0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'en_cliente');

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform public.eliminar_mov_cilindro(e2);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Técnico elimina un movimiento'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Técnico elimina un movimiento'::text; oks := oks || (case when sqlerrm ~* 'Solo el Owner o un Administrador' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.eliminar_mov_cilindro(e2);
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Administradora elimina el retorno de 3'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio') = v0 - 3 and public.saldo_cilindro('sumigases', 'OXIGENO', 'en_cliente') = c0 + 3 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('vacíos ' || v0 || ' → ' || public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio'))::text, '');
  exception when others then casos := casos || 'Administradora elimina el retorno de 3'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_historial where id = e2 and eliminado_nombre is not null and eliminado_en is not null;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Queda la línea de quién lo eliminó'::text; oks := oks || (case when x = 1 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(((select eliminado_nombre from public.cilindros_historial where id = e2))::text, '');
  exception when others then casos := casos || 'Queda la línea de quién lo eliminó'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.eliminar_mov_cilindro(e2);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Eliminarlo dos veces'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Eliminarlo dos veces'::text; oks := oks || (case when sqlerrm ~* 'No existe' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.editar_mov_cilindro(e2, '{"cantidad": 1}'::jsonb);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Corregir uno eliminado'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Corregir uno eliminado'::text; oks := oks || (case when sqlerrm ~* 'No existe' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    delete from public.cilindros_mov where id = e3; get diagnostics x = row_count; if x = 0 then raise exception 'row-level: 0 filas borradas'; end if;
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Borrar un movimiento directo (DELETE)'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Borrar un movimiento directo (DELETE)'::text; oks := oks || (case when sqlerrm ~* 'no se borra|row-level|0 filas' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    update public.cilindros_mov set cantidad = 99 where id = e3; get diagnostics x = row_count; if x = 0 then raise exception 'row-level: 0 filas cambiadas'; end if;
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Cambiar un movimiento directo (UPDATE)'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Cambiar un movimiento directo (UPDATE)'::text; oks := oks || (case when sqlerrm ~* 'se corrige desde el historial|row-level|0 filas' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;
-- ======== 5. CONTEO DE RAMPA CON APROBACIÓN
perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true); l0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno'); v0 := public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio');
   lin := jsonb_build_array(jsonb_build_object('gas', 'OXIGENO', 'lleno', l0 - 2, 'vacio', v0 + 1, 'visto_lleno', l0, 'visto_vacio', v0));

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', V::text, 'role', 'authenticated')::text, true);
    perform * from public.registrar_conteo_cilindros('sumigases', lin, 'prueba');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Vendedor envía un conteo'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Vendedor envía un conteo'::text; oks := oks || (case when sqlerrm ~* 'Owner, un Administrador o un Técnico' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T2::text, 'role', 'authenticated')::text, true);
    perform * from public.registrar_conteo_cilindros('sumigases', lin, 'prueba');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Técnico de Cumaná cuenta Sumigases'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Técnico de Cumaná cuenta Sumigases'::text; oks := oks || (case when sqlerrm ~* 'Owner, un Administrador o un Técnico' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform * from public.registrar_conteo_cilindros('sumigases', lin, '  ');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Conteo sin motivo'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Conteo sin motivo'::text; oks := oks || (case when sqlerrm ~* 'Explica por qué' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform * from public.registrar_conteo_cilindros('sumigases', jsonb_build_array(jsonb_build_object('gas', 'OXIGENO', 'lleno', 1, 'vacio', 0, 'visto_lleno', l0 + 7, 'visto_vacio', v0)), 'prueba');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Conteo con números viejos'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Conteo con números viejos'::text; oks := oks || (case when sqlerrm ~* 'cambió mientras contabas' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform * from public.registrar_conteo_cilindros('sumigases', jsonb_build_array(jsonb_build_object('gas', 'OXIGENO', 'lleno', l0, 'vacio', v0, 'visto_lleno', l0, 'visto_vacio', v0)), 'prueba');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Conteo sin diferencias'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Conteo sin diferencias'::text; oks := oks || (case when sqlerrm ~* 'coincide' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform * from public.registrar_conteo_cilindros('sumigases', jsonb_build_array(jsonb_build_object('gas', 'OXIGENO', 'lleno', 2.5, 'vacio', v0, 'visto_lleno', l0, 'visto_vacio', v0)), 'prueba');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Conteo con decimales'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Conteo con decimales'::text; oks := oks || (case when sqlerrm ~* 'número entero' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform * from public.registrar_conteo_cilindros('sumigases', jsonb_build_array(jsonb_build_object('gas', 'OXIGENO', 'lleno', -1, 'vacio', v0, 'visto_lleno', l0, 'visto_vacio', v0)), 'prueba');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Conteo con negativos'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Conteo con negativos'::text; oks := oks || (case when sqlerrm ~* 'número entero' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform * from public.registrar_conteo_cilindros('sumigases', jsonb_build_array(jsonb_build_object('gas', 'ACETILENO', 'lleno', 1, 'vacio', 0, 'visto_lleno', 0, 'visto_vacio', 0)), 'prueba');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Conteo de un gas inactivo'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Conteo de un gas inactivo'::text; oks := oks || (case when sqlerrm ~* 'no está activo' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    select id, numero, diferencias into cid, num, x from public.registrar_conteo_cilindros('sumigases', lin, 'Conteo de prueba');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Técnico envía el conteo (−2 llenos, +1 vacío)'::text; oks := oks || (case when x = 2 and num ~ '^CR-\d{4}-\d{6}$' and public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno') = l0 and public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio') = v0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((num || ' · ' || x || ' diferencia(s) · la Rampa no cambió')::text, '');
  exception when others then casos := casos || 'Técnico envía el conteo (−2 llenos, +1 vacío)'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_conteos where id = cid and estado = 'pendiente'; select count(*) into y from public.cilindros_conteo_lineas where conteo_id = cid;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'El técnico ve su conteo pendiente'::text; oks := oks || (case when x = 1 and y = 2 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((y || ' renglón(es)')::text, '');
  exception when others then casos := casos || 'El técnico ve su conteo pendiente'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform * from public.registrar_conteo_cilindros('sumigases', lin, 'otro');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Segundo conteo con uno pendiente'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Segundo conteo con uno pendiente'::text; oks := oks || (case when sqlerrm ~* 'Ya hay un conteo' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform public.aprobar_conteo_cilindros(cid, null);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Técnico aprueba'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Técnico aprueba'::text; oks := oks || (case when sqlerrm ~* 'Solo el Owner o un Administrador' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    perform public.rechazar_conteo_cilindros(cid, 'no');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Técnico rechaza'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Técnico rechaza'::text; oks := oks || (case when sqlerrm ~* 'Solo el Owner o un Administrador' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', V::text, 'role', 'authenticated')::text, true);
    perform public.aprobar_conteo_cilindros(cid, null);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Vendedor aprueba'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Vendedor aprueba'::text; oks := oks || (case when sqlerrm ~* 'Solo el Owner o un Administrador' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    update public.cilindros_conteos set estado = 'aprobado' where id = cid; get diagnostics x = row_count; if x = 0 then raise exception 'row-level: 0 filas'; end if;
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Nadie escribe la tabla de conteos directo'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Nadie escribe la tabla de conteos directo'::text; oks := oks || (case when sqlerrm ~* 'row-level|permission|0 filas' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, cliente, autorizado_por, retirado_por) values ('sumigases', 'OXIGENO', 1, 'lleno', 'en_cliente', auth.uid(), 'CLIENTE PRUEBA MACEDONIA', A, 'Chofer');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Entre el conteo y la aprobación sale 1 lleno'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno') = l0 - 1 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Entre el conteo y la aprobación sale 1 lleno'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select public.aprobar_conteo_cilindros(cid, 'visto en planta') into x;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Administradora aprueba: se aplica la diferencia, la entrega sigue'::text; oks := oks || (case when x = 2 and public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno') = l0 - 3 and public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio') = v0 + 1 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' movimiento(s) · llenos ' || l0 || ' → ' || public.saldo_cilindro('sumigases', 'OXIGENO', 'lleno') || ' (−1 entrega −2 conteo) · vacíos ' || v0 || ' → ' || public.saldo_cilindro('sumigases', 'OXIGENO', 'vacio'))::text, '');
  exception when others then casos := casos || 'Administradora aprueba: se aplica la diferencia, la entrega sigue'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_historial h join public.cilindros_mov m on m.id = h.id where m.conteo_id = cid and h.nota ~ '^Conteo de rampa CR-';
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Los movimientos quedan atados al conteo y en el historial'::text; oks := oks || (case when x = 2 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' movimiento(s)')::text, '');
  exception when others then casos := casos || 'Los movimientos quedan atados al conteo y en el historial'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select count(*) into x from public.cilindros_conteos where id = cid and estado = 'aprobado' and resuelto_nombre is not null and movimientos = 2;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'El conteo queda aprobado con nombre'::text; oks := oks || (case when x = 1 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(((select resuelto_nombre from public.cilindros_conteos where id = cid))::text, '');
  exception when others then casos := casos || 'El conteo queda aprobado con nombre'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.aprobar_conteo_cilindros(cid, null);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Aprobar dos veces'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Aprobar dos veces'::text; oks := oks || (case when sqlerrm ~* 'ya está aprobado' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;
perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true); l0 := public.saldo_cilindro('sumigases', 'ARGON', 'lleno'); v0 := public.saldo_cilindro('sumigases', 'ARGON', 'vacio');

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', T::text, 'role', 'authenticated')::text, true);
    select id into cid from public.registrar_conteo_cilindros('sumigases', jsonb_build_array(jsonb_build_object('gas', 'ARGON', 'lleno', 0, 'vacio', v0, 'visto_lleno', l0, 'visto_vacio', v0)), 'Prueba de negativo');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Técnico cuenta 0 llenos de ARGON'::text; oks := oks || (case when cid is not null then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Técnico cuenta 0 llenos de ARGON'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    insert into public.cilindros_mov (empresa_id, gas, cantidad, estado_desde, estado_hacia, usuario_id, nota) values ('sumigases', 'ARGON', 2, 'lleno', null, auth.uid(), 'Baja prueba');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Después salen 2 llenos de ARGON'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'ARGON', 'lleno') = l0 - 2 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Después salen 2 llenos de ARGON'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.aprobar_conteo_cilindros(cid, null);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Aprobar dejaría ARGON en negativo'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Aprobar dejaría ARGON en negativo'::text; oks := oks || (case when sqlerrm ~* 'dejaría ARGON llenos en -2' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.rechazar_conteo_cilindros(cid, ' ');
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Rechazar sin motivo'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Rechazar sin motivo'::text; oks := oks || (case when sqlerrm ~* 'Indica por qué' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', O::text, 'role', 'authenticated')::text, true);
    perform public.rechazar_conteo_cilindros(cid, 'Recontar');
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Owner rechaza con motivo: la Rampa no cambia'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'ARGON', 'lleno') = l0 - 2 and (select estado from public.cilindros_conteos where id = cid) = 'rechazado' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Owner rechaza con motivo: la Rampa no cambia'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    perform public.aprobar_conteo_cilindros(cid, null);
    raise exception 'CENTINELA_PASO';
  exception when others then
    if sqlerrm = 'CENTINELA_PASO' then casos := casos || 'Aprobar uno rechazado'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Se permitió y no debía (se deshizo)')::text, '');
    else casos := casos || 'Aprobar uno rechazado'::text; oks := oks || (case when sqlerrm ~* 'ya está rechazado' then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((sqlerrm)::text, ''); end if;
  end;
perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true); l0 := public.saldo_cilindro('sumigases', 'ARGON', 'lleno'); v0 := public.saldo_cilindro('sumigases', 'ARGON', 'vacio');

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', O::text, 'role', 'authenticated')::text, true);
    select id into cid from public.registrar_conteo_cilindros('sumigases', jsonb_build_array(jsonb_build_object('gas', 'ARGON', 'lleno', l0 + 1, 'vacio', v0, 'visto_lleno', l0, 'visto_vacio', v0)), 'Sobrante'); perform public.aprobar_conteo_cilindros(cid, null);
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Owner cuenta y aprueba su propio conteo'::text; oks := oks || (case when public.saldo_cilindro('sumigases', 'ARGON', 'lleno') = l0 + 1 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('')::text, '');
  exception when others then casos := casos || 'Owner cuenta y aprueba su propio conteo'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;
-- ======== 6. LA MATEMÁTICA CUADRA

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select count(*) into x from (
       select s.gas, s.estado, s.cantidad, coalesce(tt.k, 0) k from public.cilindros_saldo s
       full join (select gas, estado, sum(d)::int k from (
           select gas, estado_hacia estado, cantidad d from public.cilindros_mov where empresa_id = 'sumigases' and estado_hacia is not null and eliminado_en is null
           union all select gas, estado_desde, -cantidad from public.cilindros_mov where empresa_id = 'sumigases' and estado_desde is not null and eliminado_en is null) z group by 1, 2) tt
         on tt.gas = s.gas and tt.estado = s.estado
       where coalesce(s.empresa_id, 'sumigases') = 'sumigases' and coalesce(s.cantidad, 0) <> coalesce(tt.k, 0)) q;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'La Rampa (vista) = suma de movimientos, gas por gas'::text; oks := oks || (case when x = 0 then 'OK' else 'FALLA' end)::text; dets := dets || coalesce((x || ' descuadre(s)')::text, '');
  exception when others then casos := casos || 'La Rampa (vista) = suma de movimientos, gas por gas'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;

  begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select coalesce(sum(cantidad), 0) into x from public.cilindros_saldo where empresa_id = 'sumigases';
     select coalesce(sum(case when estado_desde is null then cantidad when estado_hacia is null then -cantidad else 0 end), 0) into y
       from public.cilindros_mov where empresa_id = 'sumigases' and eliminado_en is null and id > ultimo;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Total del parque = inicial + altas − bajas del día'::text; oks := oks || (case when x = t0 + y then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('inicial ' || t0 || ' · altas−bajas ' || y || ' · final ' || x)::text, '');
  exception when others then casos := casos || 'Total del parque = inicial + altas − bajas del día'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;
-- ======== 7. FECHAS

  begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    select fecha into num from public.cilindros_mov where id = e3;
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role', 'authenticated')::text, true);
    
    casos := casos || 'Los movimientos toman la fecha de Venezuela'::text; oks := oks || (case when (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'cilindros_mov' and column_name = 'fecha') ~ 'Caracas' and num::date = (now() at time zone 'America/Caracas')::date then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('fecha ' || num || ' · Venezuela hoy ' || (now() at time zone 'America/Caracas')::date)::text, '');
  exception when others then casos := casos || 'Los movimientos toman la fecha de Venezuela'::text; oks := oks || (case when false then 'OK' else 'FALLA' end)::text; dets := dets || coalesce(('Error: ' || sqlerrm)::text, '');
  end;
    raise exception 'FIN_DE_LA_PRUEBA';
  exception when others then
    if sqlerrm <> 'FIN_DE_LA_PRUEBA' then
      casos := casos || 'Error general'::text; oks := oks || 'FALLA'::text; dets := dets || sqlerrm;
    end if;
  end;
  perform set_config('role', 'postgres', true);
  return query select i, casos[i], oks[i], dets[i] from generate_subscripts(casos, 1) i order by i;
end $prueba$;

-- Nadie la puede llamar desde la app: solo el editor SQL.
revoke execute on function public.probar_cilindros_tmp() from public, anon, authenticated;
