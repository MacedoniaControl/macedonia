-- 46 · Los conteos ajustan las cantidades al terminarlos, sin que nadie autorice
--
-- Pedido del usuario (15-10-2026): «ya no es necesario que nadie autorice
-- para que se modifiquen las cantidades», pero los registros se siguen
-- generando.
--
-- INVENTARIO. Antes (23, 25, 29) cerrar un conteo no tocaba la existencia:
-- quedaba «por verificar» hasta que el Owner o un Administrador lo aprobaba.
-- Ahora cerrar_conteo, además de numerar y archivar, mete cada diferencia como
-- movimiento de inventario al momento (motivo «Conteo CF-…: el sistema decía
-- X, se contaron Y») y deja el conteo «aprobado». Siguen quedando: el número,
-- la foto de la existencia y del costo, las actas, la línea de tiempo y quién
-- contó y quién cerró. Quién puede cerrar no cambia (puede_contar).
--
-- RAMPA. Ya ajustaba al contarse (31), pero quedaba «por verificar» y no se
-- podía contar otra vez hasta que alguien la verificara. Ahora queda
-- «aprobado» al registrarse, sin esa espera.
--
-- PUBLICAR LO QUE ESPERABA. Los conteos que hoy están por verificar se
-- aplican en esta misma migración, del más viejo al más nuevo. Si dos
-- conteos de inventario por verificar tienen el mismo producto, NO se aplica
-- nada: cada uno mide su diferencia contra la foto que tomó al cerrar, y
-- aplicar los dos sumaría esa diferencia dos veces. Lo dice el paso 0; se
-- elimina uno de los dos desde el historial y se corre de nuevo.
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------- 0. ANTES DE APLICAR: lo que espera
-- Solo informa. «productos_en_dos_conteos» debe ser 0 para que el paso 4 aplique.
select
  (select count(*) from public.conteos
    where cerrado and eliminado_en is null and ajuste in ('pendiente', 'sin_diferencias')) as inventario_por_verificar,
  (select count(*) from public.cilindros_conteos where estado = 'pendiente') as rampa_por_verificar,
  (select count(*) from (
     select c.empresa_id, l.codigo
       from public.conteo_lineas l join public.conteos c on c.id = l.conteo_id
      where c.cerrado and c.eliminado_en is null and c.ajuste = 'pendiente' and l.cantidad <> l.existencia_sistema
      group by c.empresa_id, l.codigo having count(*) > 1) x) as productos_en_dos_conteos;

-- ---------------------------------------------------------------- 1. APLICAR UN CONTEO DE INVENTARIO (uso interno)
-- Lo mismo que hacía aprobar_ajuste: cada renglón que no cuadra entra como
-- movimiento contra la existencia que se tomó al cerrar. Devuelve cuántos.
create or replace function public.aplicar_ajuste_conteo(p_conteo bigint, p_nota text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  c   public.conteos%rowtype;
  hoy date := (now() at time zone 'America/Caracas')::date;
  n   integer;
begin
  select * into c from public.conteos where id = p_conteo for update;
  if not found or c.eliminado_en is not null then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not c.cerrado then raise exception 'El conteo todavía está abierto.'; end if;
  if c.ajuste = 'aprobado' then return 0; end if;          -- ya entró: no se repite
  if c.ajuste = 'rechazado' then raise exception 'El conteo % fue rechazado: no se aplica.', c.numero; end if;

  insert into public.movimientos_inventario
    (empresa_id, fecha, direccion, origen, codigo, nombre, cantidad, motivo, documento, afecta_inventario_real, usuario_id)
  select c.empresa_id, hoy,
         case when l.cantidad > l.existencia_sistema then 'entrada' else 'salida' end::public.direccion_mov,
         'manual', l.codigo, coalesce(l.nombre, l.codigo), abs(l.cantidad - l.existencia_sistema),
         'Conteo ' || c.numero || ': el sistema decía ' || l.existencia_sistema || ', se contaron ' || l.cantidad ||
           coalesce('. ' || nullif(trim(p_nota), ''), ''),
         c.numero, true, auth.uid()
    from public.conteo_lineas l
   where l.conteo_id = p_conteo and l.cantidad <> l.existencia_sistema;
  get diagnostics n = row_count;

  update public.conteos set ajuste = 'aprobado', ajuste_en = now(), ajuste_por = auth.uid(),
                            ajuste_nota = nullif(trim(p_nota), '')
   where id = p_conteo;
  insert into public.conteo_eventos (conteo_id, tipo, detalle, usuario_id)
  values (p_conteo, 'ajuste_aprobado',
          case when n = 0
               then 'Sin diferencias: la existencia no cambia.'
               else 'La existencia se ajustó: ' || n || ' movimiento(s) de inventario con motivo «Conteo ' || c.numero || '».' end ||
          coalesce(' ' || nullif(trim(p_nota), ''), ''), auth.uid());
  return n;
end $$;
revoke execute on function public.aplicar_ajuste_conteo(bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. CERRAR = NUMERAR, ARCHIVAR Y AJUSTAR
create or replace function public.cerrar_conteo(p_conteo bigint, p_conto text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  c        public.conteos%rowtype;
  v_numero text;
  v_conto  text;
  v_difs   integer;
  v_lineas integer;
begin
  select * into c from public.conteos where id = p_conteo for update;
  if not found or c.eliminado_en is not null then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_contar()) then
    raise exception 'Sin permiso para cerrar conteos de %.', c.empresa_id;
  end if;
  if c.cerrado then raise exception 'El conteo ya estaba cerrado: %.', c.numero; end if;

  select count(*) into v_lineas from public.conteo_lineas where conteo_id = p_conteo;
  if v_lineas = 0 then raise exception 'No se contó ningún producto todavía.'; end if;

  v_conto := coalesce(nullif(trim(p_conto), ''), nullif(trim(c.conto), ''), (select u.nombre from public.usuarios u where u.id = auth.uid()));

  update public.conteo_lineas l
     set existencia_sistema = coalesce((select e.existencia from public.existencias e
                                         where e.empresa_id = c.empresa_id and e.codigo = l.codigo), 0),
         nombre = coalesce(l.nombre, (select p.nombre from public.productos p where p.empresa_id = c.empresa_id and p.codigo = l.codigo), l.codigo),
         unidad = coalesce(l.unidad, (select p.unidad from public.productos p where p.empresa_id = c.empresa_id and p.codigo = l.codigo))
   where l.conteo_id = p_conteo;

  insert into public.conteo_costos (conteo_id, codigo, costo_unitario)
  select l.conteo_id, l.codigo, p.costo_unitario
    from public.conteo_lineas l
    join public.productos p on p.empresa_id = c.empresa_id and p.codigo = l.codigo
   where l.conteo_id = p_conteo and p.costo_unitario > 0
  on conflict (conteo_id, codigo) do nothing;

  select count(*) into v_difs from public.conteo_lineas
   where conteo_id = p_conteo and cantidad <> existencia_sistema;

  v_numero := public.numero_conteo(c.empresa_id);
  update public.conteos
     set cerrado = true, numero = v_numero, conto = v_conto,
         cerrado_en = now(), cerrado_por = auth.uid(),
         ajuste = case when v_difs > 0 then 'pendiente' else 'sin_diferencias' end
   where id = p_conteo;

  insert into public.conteo_eventos (conteo_id, tipo, detalle, usuario_id)
  values (p_conteo, 'cerrado',
          'Se asignó el número ' || v_numero || '. ' || v_lineas || ' renglón(es), ' || v_difs ||
          ' con diferencia. La existencia del sistema se tomó en este momento.', auth.uid());

  -- Sin autorización de por medio: las diferencias entran ya.
  perform public.aplicar_ajuste_conteo(p_conteo, 'Aplicado al cerrar el conteo.');
  return v_numero;
end $$;
revoke execute on function public.cerrar_conteo(bigint, text) from public, anon;
grant execute on function public.cerrar_conteo(bigint, text) to authenticated;

-- aprobar_ajuste sigue existiendo (la app vieja lo llama) y hace lo mismo,
-- para el Owner o un Administrador. Con la regla nueva casi nunca hay nada
-- que aprobar.
create or replace function public.aprobar_ajuste(p_conteo bigint, p_nota text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare c public.conteos%rowtype;
begin
  select * into c from public.conteos where id = p_conteo;
  if not found or c.eliminado_en is not null then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador aplica un conteo pendiente.';
  end if;
  return public.aplicar_ajuste_conteo(p_conteo, p_nota);
end $$;
revoke execute on function public.aprobar_ajuste(bigint, text) from public, anon;
grant execute on function public.aprobar_ajuste(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 3. RAMPA: queda aplicada y verificada al registrarse
create or replace function public.registrar_conteo_cilindros(p_empresa text, p_lineas jsonb, p_motivo text)
returns table (id bigint, numero text, diferencias integer)
language plpgsql security definer set search_path = public as $$
declare
  v_id     bigint;
  v_numero text;
  v_nombre text;
  v_dif    integer := 0;
  l        jsonb;
  e        text;
  v_sis    integer;
  v_cont   integer;
  v_visto  integer;
begin
  if not (public.puede_empresa(p_empresa) and public.puede_operar_cilindros()) then
    raise exception 'Contar la Rampa lo hacen el Owner, un Administrador o un Técnico.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Explica por qué no cuadra: queda en el historial.';
  end if;
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El conteo no trae gases.';
  end if;
  -- Uno a la vez por empresa, para que dos conteos simultáneos no midan
  -- contra la misma Rampa. Ya no hay que esperar a que alguien verifique.
  perform pg_advisory_xact_lock(hashtext('cil_conteo:' || p_empresa));

  select u.nombre into v_nombre from public.usuarios u where u.id = auth.uid();
  v_numero := public.numero_conteo_cilindros(p_empresa);
  insert into public.cilindros_conteos (empresa_id, numero, creado_por, creado_nombre, motivo)
  values (p_empresa, v_numero, auth.uid(), coalesce(v_nombre, 'Sin nombre'), trim(p_motivo))
  returning cilindros_conteos.id into v_id;

  for l in select x.value from jsonb_array_elements(p_lineas) as x loop
    if not exists (select 1 from public.gases g where g.empresa_id = p_empresa and g.nombre = l->>'gas' and g.activo) then
      raise exception 'El gas % no está activo en esta empresa.', l->>'gas';
    end if;
    foreach e in array array['lleno', 'vacio'] loop
      if jsonb_typeof(l->e) is distinct from 'number' or (l->>e)::numeric <> trunc((l->>e)::numeric) or (l->>e)::numeric < 0 then
        raise exception 'Revisa %: la cantidad tiene que ser un número entero, cero o más.', l->>'gas';
      end if;
      v_cont  := (l->>e)::integer;
      v_visto := coalesce((l->>('visto_' || e))::integer, 0);
      v_sis   := public.saldo_cilindro(p_empresa, l->>'gas', e::public.estado_cilindro);
      if v_visto <> v_sis then
        raise exception 'La Rampa cambió mientras contabas (alguien registró un movimiento). Revisa los números y envíalo otra vez.';
      end if;
      insert into public.cilindros_conteo_lineas (conteo_id, gas, estado, sistema, contado)
      values (v_id, l->>'gas', e::public.estado_cilindro, v_sis, v_cont);
      if v_cont <> v_sis then v_dif := v_dif + 1; end if;
    end loop;
  end loop;

  if v_dif = 0 then
    raise exception 'El conteo coincide con la Rampa: no hay nada que ajustar.';
  end if;

  -- La Rampa queda como se contó, ya, y el conteo queda verificado.
  perform public.aplicar_conteo_cilindros(v_id);
  update public.cilindros_conteos
     set estado = 'aprobado', resuelto_en = now(), resuelto_por = auth.uid(),
         resuelto_nombre = coalesce(v_nombre, 'Sin nombre'), resuelto_nota = 'Aplicado al registrar el conteo.'
   where cilindros_conteos.id = v_id;
  return query select v_id, v_numero, v_dif;
end $$;
revoke execute on function public.registrar_conteo_cilindros(text, jsonb, text) from public, anon;
grant execute on function public.registrar_conteo_cilindros(text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------- 4. PUBLICAR LO QUE ESPERABA
do $$
declare
  r       record;
  cruzan  integer;
  n_inv   integer := 0;
  n_rampa integer := 0;
begin
  select count(*) into cruzan from (
    select c.empresa_id, l.codigo
      from public.conteo_lineas l join public.conteos c on c.id = l.conteo_id
     where c.cerrado and c.eliminado_en is null and c.ajuste = 'pendiente' and l.cantidad <> l.existencia_sistema
     group by c.empresa_id, l.codigo having count(*) > 1) x;
  if cruzan > 0 then
    raise exception 'Hay % producto(s) con diferencia en dos conteos por verificar: aplicar los dos sumaría la diferencia dos veces. Elimina uno de esos conteos en Inventario → Conteo → Historial y corre esta migración otra vez.', cruzan;
  end if;

  for r in select id from public.conteos
            where cerrado and eliminado_en is null and ajuste in ('pendiente', 'sin_diferencias')
            order by id loop
    perform public.aplicar_ajuste_conteo(r.id, 'Publicado sin autorización (migración 46).');
    n_inv := n_inv + 1;
  end loop;

  for r in select id from public.cilindros_conteos where estado = 'pendiente' order by id loop
    perform public.aplicar_conteo_cilindros(r.id, null);   -- los de la regla vieja (27) todavía no entraron
    update public.cilindros_conteos
       set estado = 'aprobado', resuelto_en = now(), resuelto_nombre = 'Migración 46',
           resuelto_nota = 'Publicado sin autorización (migración 46).'
     where cilindros_conteos.id = r.id;
    n_rampa := n_rampa + 1;
  end loop;

  raise notice 'Publicados: % conteo(s) de inventario y % de la Rampa.', n_inv, n_rampa;
end $$;

-- ---------------------------------------------------------------- 5. COMPROBACIÓN
-- Debe decir: funciones 3, y 0 por verificar en las dos columnas.
select
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('aplicar_ajuste_conteo', 'cerrar_conteo', 'registrar_conteo_cilindros')) as funciones,
  (select count(*) from public.conteos
    where cerrado and eliminado_en is null and ajuste in ('pendiente', 'sin_diferencias')) as inventario_por_verificar,
  (select count(*) from public.cilindros_conteos where estado = 'pendiente') as rampa_por_verificar;
