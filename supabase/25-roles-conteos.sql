-- ============================================================================
-- 25 · QUIÉN CUENTA, QUIÉN VE LOS MOVIMIENTOS, Y CORREGIR O ELIMINAR UN CONTEO
--
-- Decisiones del Owner (24-09-2026):
--   · Los conteos los hacen el Técnico, el Administrador y el Owner. El
--     Vendedor no cuenta ni mueve inventario.
--   · Los movimientos de inventario son información gerencial: solo el Owner
--     y el Administrador los ven y los registran.
--   · El historial de conteos solo lo ven el Owner y el Administrador. Ellos
--     pueden corregir un conteo y eliminarlo. Eliminar deja una línea con
--     quién, cuándo y qué conteo, como un mensaje eliminado en WhatsApp.
--
-- La existencia se calcula sumando movimientos. Si solo se cerraran los
-- movimientos, el Vendedor y el Técnico verían todo el inventario en cero: por
-- eso la existencia (y el último conteo del Master) pasan a calcularse en una
-- función que lee los movimientos por ellos, filtrada por las empresas que la
-- persona puede ver. El detalle de los movimientos sigue cerrado.
--
-- Se puede correr más de una vez.
-- ============================================================================

-- ---------------------------------------------------------------- 1. QUIÉN CUENTA
create or replace function public.puede_contar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('owner', 'admin', 'tecnico') from public.usuarios where id = auth.uid() and activo), false)
     and public.puede('inventory')
$$;
revoke execute on function public.puede_contar() from public, anon;
grant execute on function public.puede_contar() to authenticated;

-- ---------------------------------------------------------------- 2. LA LÍNEA DEL CONTEO ELIMINADO
alter table public.conteos
  add column if not exists eliminado_en      timestamptz,
  add column if not exists eliminado_por     uuid references public.usuarios(id),
  add column if not exists eliminado_nombre  text,
  -- "CF-2026-000001 · 05 - SOLDADURA · 23-09-2026": lo que se borró, en una línea.
  add column if not exists eliminado_resumen text;

-- ---------------------------------------------------------------- 3. EXISTENCIA SIN ABRIR LOS MOVIMIENTOS
-- La función corre con los permisos de su dueño (lee todos los movimientos),
-- pero solo devuelve las empresas que la persona puede ver, y solo a quien
-- tiene el Inventario. Es la misma pared entre empresas de siempre.
create or replace function public.existencias_permitidas()
returns table (empresa_id text, codigo text, existencia numeric, existencia_fisica numeric)
language sql stable security definer set search_path = public as $$
  select m.empresa_id, m.codigo,
         sum(case when m.direccion = 'entrada' then m.cantidad else -m.cantidad end),
         sum(case when m.direccion = 'entrada' and m.afecta_inventario_real then m.cantidad
                  when m.direccion = 'salida'  and m.afecta_inventario_real then -m.cantidad
                  else 0 end)
    from public.movimientos_inventario m
   where m.empresa_id = any (public.empresas_permitidas())
     and public.puede('inventory')
   group by m.empresa_id, m.codigo
$$;
revoke execute on function public.existencias_permitidas() from public, anon;
grant execute on function public.existencias_permitidas() to authenticated;

-- security_invoker sigue encendido (lo exige 04-verificacion): la vista no
-- lee la tabla, llama a la función.
create or replace view public.existencias with (security_invoker = on) as
select empresa_id, codigo, existencia, existencia_fisica from public.existencias_permitidas();

-- El último conteo de cada producto, para la columna «Contado» del Master.
create or replace function public.ultimo_conteo_permitido()
returns table (empresa_id text, codigo text, cantidad numeric, fecha date, zona text, conteo_id bigint)
language sql stable security definer set search_path = public as $$
  select distinct on (c.empresa_id, l.codigo) c.empresa_id, l.codigo, l.cantidad, c.fecha, c.zona, c.id
    from public.conteo_lineas l
    join public.conteos c on c.id = l.conteo_id
   where c.cerrado and c.eliminado_en is null
     and c.empresa_id = any (public.empresas_permitidas())
     and public.puede('inventory')
   order by c.empresa_id, l.codigo, c.fecha desc, c.id desc
$$;
revoke execute on function public.ultimo_conteo_permitido() from public, anon;
grant execute on function public.ultimo_conteo_permitido() to authenticated;

create or replace view public.ultimo_conteo with (security_invoker = on) as
-- cantidad con su tipo original (numeric(14,3)): reemplazar la vista exige los mismos tipos.
select empresa_id, codigo, cantidad::numeric(14,3) as cantidad, fecha, zona, conteo_id from public.ultimo_conteo_permitido();

-- ---------------------------------------------------------------- 4. MOVIMIENTOS: OWNER Y ADMINISTRADOR
drop policy if exists movimientos_lectura on public.movimientos_inventario;
create policy movimientos_lectura on public.movimientos_inventario for select using (
  empresa_id = any ((select public.empresas_permitidas())::text[])
  and (select public.puede('inventory')) and (select public.puede_finanzas()));

drop policy if exists movimientos_inserta on public.movimientos_inventario;
create policy movimientos_inserta on public.movimientos_inventario for insert with check (
  empresa_id = any ((select public.empresas_permitidas())::text[])
  and (select public.puede('inventory')) and (select public.puede_finanzas()));

-- ---------------------------------------------------------------- 5. CONTEOS
-- El Técnico ve y escribe solo el conteo ABIERTO. Los cerrados (el historial)
-- son del Owner y el Administrador. Nadie borra una fila: se elimina con
-- eliminar_conteo(), que deja la línea.
drop policy if exists conteos_lectura on public.conteos;
create policy conteos_lectura on public.conteos for select using (
  public.puede_empresa(empresa_id) and (select public.puede('inventory'))
  and ((not cerrado and eliminado_en is null and (select public.puede_contar())) or (select public.puede_finanzas())));

drop policy if exists conteos_escribe on public.conteos;
drop policy if exists conteos_inserta on public.conteos;
create policy conteos_inserta on public.conteos for insert with check (
  public.puede_empresa(empresa_id) and (select public.puede_contar()));

drop policy if exists conteos_actualiza on public.conteos;
create policy conteos_actualiza on public.conteos for update
  using (public.puede_empresa(empresa_id) and (select public.puede_contar()) and not cerrado and eliminado_en is null)
  with check (public.puede_empresa(empresa_id) and (select public.puede_contar()));

-- ---------------------------------------------------------------- 6. EL CANDADO, CON LLAVE PARA CORREGIR
-- Igual que en la 23, más dos cosas:
--   · Los campos de «eliminado» solo los escribe eliminar_conteo().
--   · Los renglones de un conteo cerrado solo cambian desde editar_conteo() y
--     eliminar_conteo(), que abren el candado dentro de su propia transacción
--     (macedonia.edicion = 'si'). Esa marca solo sirve dentro de funciones
--     security definer: afuera, current_user no es privilegiado.
create or replace function public.conteo_inmutable()
returns trigger
language plpgsql as $$
declare
  v_cerrado    boolean;
  v_eliminado  timestamptz;
  privilegiado boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
  corrige      boolean := privilegiado and coalesce(current_setting('macedonia.edicion', true), '') = 'si';
begin
  if tg_table_name = 'conteos' then
    if tg_op = 'DELETE' then
      raise exception 'Un conteo no se borra: se elimina desde el historial, y queda la línea de quién lo eliminó.';
    end if;

    if not privilegiado then
      if tg_op = 'UPDATE' and (old.cerrado or old.eliminado_en is not null) then
        raise exception 'El conteo % está cerrado: lo corrige el Owner o un Administrador, desde el historial.', coalesce(old.numero, '');
      end if;
      if new.cerrado or new.numero is not null or new.cerrado_en is not null or new.cerrado_por is not null
         or new.ajuste is not null or new.ajuste_en is not null or new.ajuste_por is not null or new.ajuste_nota is not null
         or new.acta_pdf is not null or new.acta_xlsx is not null or new.valorizada_pdf is not null or new.valorizada_xlsx is not null
         or new.eliminado_en is not null or new.eliminado_por is not null or new.eliminado_nombre is not null or new.eliminado_resumen is not null then
        raise exception 'Un conteo se cierra, se ajusta y se elimina con sus funciones, no cambiando sus campos.';
      end if;
      return new;
    end if;

    if tg_op = 'UPDATE' and old.cerrado then
      if (new.numero, new.empresa_id, new.fecha, new.departamento, new.conto, new.zona, new.cerrado, new.cerrado_en, new.cerrado_por)
         is distinct from
         (old.numero, old.empresa_id, old.fecha, old.departamento, old.conto, old.zona, old.cerrado, old.cerrado_en, old.cerrado_por) then
        raise exception 'El conteo % está cerrado: sus datos no cambian.', old.numero;
      end if;
    end if;
    return new;
  end if;

  -- conteo_lineas
  select c.cerrado, c.eliminado_en into v_cerrado, v_eliminado
    from public.conteos c where c.id = coalesce(new.conteo_id, old.conteo_id);
  if v_eliminado is not null and not corrige then
    raise exception 'Ese conteo fue eliminado.';
  end if;
  if coalesce(v_cerrado, false) and not corrige then
    raise exception 'El conteo está cerrado: sus renglones los corrige el Owner o un Administrador, desde el historial.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' then new.actualizado_en := now(); end if;
  -- La foto de la existencia la pone cerrar_conteo(), no quien anota.
  if not privilegiado and new.existencia_sistema is not null then
    raise exception 'La existencia del sistema se toma al cerrar, no al anotar.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 7. CERRAR Y ARTÍCULO NUEVO: QUIEN CUENTA
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

  v_conto := coalesce(nullif(trim(p_conto), ''), (select u.nombre from public.usuarios u where u.id = auth.uid()));

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
  return v_numero;
end $$;
revoke execute on function public.cerrar_conteo(bigint, text) from public, anon;
grant execute on function public.cerrar_conteo(bigint, text) to authenticated;

create or replace function public.crear_articulo_nuevo(
  p_empresa text, p_nombre text, p_unidad text, p_departamento text,
  p_nombre_corto text default null, p_marca text default null,
  p_modelo text default null, p_referencia text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := upper(regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g'));
  v_ya     text;
  v_cod    text;
begin
  if not (public.puede_empresa(p_empresa) and public.puede_contar()) then
    raise exception 'Sin permiso para crear artículos en %.', p_empresa;
  end if;
  if v_nombre = '' then raise exception 'Falta el nombre.'; end if;
  if coalesce(trim(p_unidad), '') = '' then raise exception 'Falta la unidad.'; end if;
  if not exists (select 1 from public.departamentos where empresa_id = p_empresa and codigo = p_departamento) then
    raise exception 'El departamento % no existe.', coalesce(p_departamento, '(vacío)');
  end if;
  select codigo into v_ya from public.productos
   where empresa_id = p_empresa and upper(regexp_replace(trim(nombre), '\s+', ' ', 'g')) = v_nombre limit 1;
  if v_ya is not null then raise exception 'Ya existe un artículo con ese nombre: %.', v_ya; end if;

  v_cod := public.sku_macedonia(p_empresa);
  insert into public.productos (empresa_id, codigo, nombre, unidad, departamento, nombre_corto, marca, modelo, referencia)
  values (p_empresa, v_cod, v_nombre, upper(trim(p_unidad)), p_departamento,
          nullif(upper(trim(p_nombre_corto)), ''), nullif(upper(trim(p_marca)), ''),
          nullif(upper(trim(p_modelo)), ''), nullif(upper(trim(p_referencia)), ''));
  return v_cod;
end $$;
revoke execute on function public.crear_articulo_nuevo(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.crear_articulo_nuevo(text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- 8. APROBAR Y RECHAZAR (textos)
create or replace function public.aprobar_ajuste(p_conteo bigint, p_nota text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  c   public.conteos%rowtype;
  hoy date := (now() at time zone 'America/Caracas')::date;
  n   integer;
begin
  select * into c from public.conteos where id = p_conteo for update;
  if not found or c.eliminado_en is not null then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador aprueba ajustes de inventario.';
  end if;
  if not c.cerrado or c.ajuste <> 'pendiente' then
    raise exception 'El conteo % no tiene un ajuste pendiente (está: %).', coalesce(c.numero, 'abierto'), coalesce(c.ajuste, 'abierto');
  end if;

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
  values (p_conteo, 'ajuste_aprobado', n || ' movimiento(s) de inventario con motivo «Conteo ' || c.numero || '».' ||
          coalesce(' ' || nullif(trim(p_nota), ''), ''), auth.uid());
  return n;
end $$;
revoke execute on function public.aprobar_ajuste(bigint, text) from public, anon;
grant execute on function public.aprobar_ajuste(bigint, text) to authenticated;

create or replace function public.rechazar_ajuste(p_conteo bigint, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
declare c public.conteos%rowtype;
begin
  select * into c from public.conteos where id = p_conteo for update;
  if not found or c.eliminado_en is not null then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador decide sobre un ajuste.';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Indica por qué se rechaza: sin motivo nadie sabe qué recontar.';
  end if;
  if not c.cerrado or c.ajuste <> 'pendiente' then
    raise exception 'El conteo % no tiene un ajuste pendiente.', coalesce(c.numero, 'abierto');
  end if;
  update public.conteos set ajuste = 'rechazado', ajuste_en = now(), ajuste_por = auth.uid(), ajuste_nota = trim(p_nota)
   where id = p_conteo;
  insert into public.conteo_eventos (conteo_id, tipo, detalle, usuario_id)
  values (p_conteo, 'ajuste_rechazado', trim(p_nota), auth.uid());
end $$;
revoke execute on function public.rechazar_ajuste(bigint, text) from public, anon;
grant execute on function public.rechazar_ajuste(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 9. CORREGIR UN CONTEO (Owner o Administrador)
-- p_cambios: [{"codigo": "OXI6", "cantidad": 12, "observacion": "…"}, …]
--   · Cada cambio queda en el historial del conteo: quién, qué renglón, de cuánto a cuánto.
--   · Si el ajuste ya se aprobó, la diferencia de la corrección entra al
--     inventario como movimiento («Corrección del conteo …»): la existencia
--     queda como si se hubiera contado bien desde el principio.
--   · Si no se había aprobado, el ajuste vuelve a quedar pendiente (o sin
--     diferencias) para revisarlo con los números corregidos.
create or replace function public.editar_conteo(p_conteo bigint, p_cambios jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  c        public.conteos%rowtype;
  cambio   jsonb;
  l        public.conteo_lineas%rowtype;
  v_cant   numeric;
  v_obs    text;
  v_quien  text := (select nombre from public.usuarios where id = auth.uid());
  hoy      date := (now() at time zone 'America/Caracas')::date;
  n        integer := 0;
  v_difs   integer;
begin
  select * into c from public.conteos where id = p_conteo for update;
  if not found or c.eliminado_en is not null then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador corrige un conteo.';
  end if;
  perform set_config('macedonia.edicion', 'si', true);

  for cambio in select * from jsonb_array_elements(coalesce(p_cambios, '[]'::jsonb)) loop
    select * into l from public.conteo_lineas where conteo_id = p_conteo and codigo = cambio->>'codigo';
    if not found then raise exception 'El renglón % no está en este conteo.', cambio->>'codigo'; end if;
    v_cant := coalesce((cambio->>'cantidad')::numeric, l.cantidad);
    v_obs  := case when cambio ? 'observacion' then nullif(trim(cambio->>'observacion'), '') else l.observacion end;
    if v_cant < 0 then raise exception 'La cantidad de % no puede ser negativa.', l.codigo; end if;
    continue when v_cant = l.cantidad and v_obs is not distinct from l.observacion;

    update public.conteo_lineas set cantidad = v_cant, observacion = v_obs where id = l.id;
    n := n + 1;

    insert into public.conteo_eventos (conteo_id, tipo, detalle, usuario_id)
    values (p_conteo, 'editado',
            l.codigo || ' · ' || coalesce(l.nombre, l.codigo) ||
            case when v_cant <> l.cantidad then ': contado ' || l.cantidad || ' → ' || v_cant else '' end ||
            case when v_obs is distinct from l.observacion then ' · observación: «' || coalesce(v_obs, '') || '»' else '' end ||
            '. Corrigió ' || coalesce(v_quien, 'un usuario') || '.', auth.uid());

    -- El costo, por si el renglón no tenía diferencia al cerrar y ahora sí.
    if c.cerrado then
      insert into public.conteo_costos (conteo_id, codigo, costo_unitario)
      select p_conteo, p.codigo, p.costo_unitario from public.productos p
       where p.empresa_id = c.empresa_id and p.codigo = l.codigo and p.costo_unitario > 0
      on conflict (conteo_id, codigo) do nothing;
    end if;

    if c.cerrado and c.ajuste = 'aprobado' and v_cant <> l.cantidad then
      insert into public.movimientos_inventario
        (empresa_id, fecha, direccion, origen, codigo, nombre, cantidad, motivo, documento, afecta_inventario_real, usuario_id)
      values (c.empresa_id, hoy,
              case when v_cant > l.cantidad then 'entrada' else 'salida' end::public.direccion_mov,
              'manual', l.codigo, coalesce(l.nombre, l.codigo), abs(v_cant - l.cantidad),
              'Corrección del conteo ' || c.numero || ': se contaron ' || v_cant || ', no ' || l.cantidad,
              c.numero, true, auth.uid());
    end if;
  end loop;

  if n > 0 and c.cerrado and c.ajuste is distinct from 'aprobado' then
    select count(*) into v_difs from public.conteo_lineas
     where conteo_id = p_conteo and cantidad <> existencia_sistema;
    update public.conteos
       set ajuste = case when v_difs > 0 then 'pendiente' else 'sin_diferencias' end,
           ajuste_en = null, ajuste_por = null, ajuste_nota = null
     where id = p_conteo;
  end if;
  return n;
end $$;
revoke execute on function public.editar_conteo(bigint, jsonb) from public, anon;
grant execute on function public.editar_conteo(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------- 10. ELIMINAR UN CONTEO (Owner o Administrador)
-- Se borran sus renglones, costos e historial, y la fila queda como la línea
-- «Conteo … eliminado por … el …». Las existencias NO cambian: si su ajuste
-- se había aprobado, esos movimientos ya son parte del inventario (se corrigen
-- con editar_conteo() antes de eliminar, si hace falta).
-- Devuelve las rutas de las actas para que el servidor borre los archivos.
create or replace function public.eliminar_conteo(p_conteo bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c        public.conteos%rowtype;
  v_quien  text := (select nombre from public.usuarios where id = auth.uid());
  v_depto  text;
  v_actas  jsonb;
begin
  select * into c from public.conteos where id = p_conteo for update;
  if not found or c.eliminado_en is not null then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo el Owner o un Administrador elimina un conteo.';
  end if;
  perform set_config('macedonia.edicion', 'si', true);

  v_depto := coalesce((select d.codigo || ' - ' || d.nombre from public.departamentos d
                        where d.empresa_id = c.empresa_id and d.codigo = c.departamento), c.zona, 'Sin departamento');
  v_actas := jsonb_build_array(c.acta_pdf, c.acta_xlsx, c.valorizada_pdf, c.valorizada_xlsx);

  delete from public.conteo_lineas  where conteo_id = p_conteo;
  delete from public.conteo_costos  where conteo_id = p_conteo;
  delete from public.conteo_eventos where conteo_id = p_conteo;
  update public.conteos
     set eliminado_en = now(), eliminado_por = auth.uid(), eliminado_nombre = coalesce(v_quien, 'Un usuario'),
         eliminado_resumen = coalesce(c.numero, 'Conteo sin número') || ' · ' || v_depto || ' · ' || to_char(c.fecha, 'DD-MM-YYYY')
   where id = p_conteo;
  return jsonb_build_object('numero', c.numero, 'actas', v_actas);
end $$;
revoke execute on function public.eliminar_conteo(bigint) from public, anon;
grant execute on function public.eliminar_conteo(bigint) to authenticated;

-- ---------------------------------------------------------------- 11. RESUMEN PARA EL HISTORIAL
drop view if exists public.conteos_resumen;
create view public.conteos_resumen with (security_invoker = on) as
select c.id, c.empresa_id, c.numero, c.fecha, c.departamento, d.nombre as departamento_nombre, c.zona,
       c.conto, c.cerrado, c.cerrado_en, c.ajuste, c.ajuste_en, c.ajuste_nota, c.created_at as abierto_en,
       c.acta_pdf, c.acta_xlsx, c.valorizada_pdf, c.valorizada_xlsx,
       count(l.id)::integer as renglones,
       (count(l.id) filter (where l.existencia_sistema is not null and l.cantidad <> l.existencia_sistema))::integer as diferencias,
       (count(l.id) filter (where l.codigo like 'MC-%'))::integer as articulos_nuevos,
       c.eliminado_en, c.eliminado_nombre, c.eliminado_resumen
  from public.conteos c
  left join public.departamentos d on d.empresa_id = c.empresa_id and d.codigo = c.departamento
  left join public.conteo_lineas l on l.conteo_id = c.id
 group by c.id, d.nombre;

-- ---------------------------------------------------------------- 12. ACTAS: OWNER Y ADMINISTRADOR
drop policy if exists actas_lee on storage.objects;
create policy actas_lee on storage.objects
  for select using (
    bucket_id = 'actas'
    and public.puede_empresa((storage.foldername(name))[1])
    and public.puede('inventory')
    and public.puede_finanzas()
  );

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe devolver todo en «si».
select
  (select case when count(*) = 4 then 'si' else 'NO' end from information_schema.columns
    where table_schema = 'public' and table_name = 'conteos'
      and column_name in ('eliminado_en', 'eliminado_por', 'eliminado_nombre', 'eliminado_resumen')) as eliminado_listo,
  (select case when count(*) = 5 then 'si' else 'NO' end from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('puede_contar', 'existencias_permitidas', 'ultimo_conteo_permitido', 'editar_conteo', 'eliminar_conteo')) as funciones_listas,
  (select case when count(*) = 2 then 'si' else 'NO' end from pg_policies
    where schemaname = 'public' and tablename = 'movimientos_inventario'
      and policyname in ('movimientos_lectura', 'movimientos_inserta')
      and coalesce(qual, '') || coalesce(with_check, '') like '%puede_finanzas%') as movimientos_gerenciales,
  (select case when count(*) = 3 then 'si' else 'NO' end from pg_policies
    where schemaname = 'public' and tablename = 'conteos'
      and policyname in ('conteos_lectura', 'conteos_inserta', 'conteos_actualiza')) as conteos_listos;
