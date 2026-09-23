-- ============================================================================
-- 23 · HISTORIAL DE CONTEOS Y ACTAS
--
-- Decisiones del owner (23-09-2026):
--   · Todo conteo genera un historial, y cada historial queda en un archivo
--     Excel y uno PDF: el acta. Hay ademas un acta VALORIZADA, con el costo de
--     cada diferencia, que solo ven owner y admin.
--   · Cerrar un conteo NO ajusta el inventario (ya era la regla de la 17). Al
--     cerrar se asigna el numero, se toma la existencia del sistema en ese
--     momento y se generan las actas. El ajuste lo aprueba un owner o admin
--     por separado, con motivo, y queda en el historial.
--   · Numero CF-AAAA-NNNNNN, asignado al CERRAR (un conteo descartado no gasta
--     numero) y reiniciado cada año.
--   · Un conteo cerrado no se modifica ni se borra: si hubo un error, se hace
--     un conteo nuevo. Lo garantiza la base, no la pantalla.
--
-- Correr DESPUES de 21 y 22. Se puede correr mas de una vez.
-- Todo va con "public." porque el SQL Editor no siempre lo busca solo.
-- ============================================================================


-- ---------------------------------------------------------------- 1. CONTEOS
alter table public.conteos
  add column if not exists numero        text,
  add column if not exists departamento  text,
  -- Quien conto en el galpon, como en la planilla de papel. Puede no ser quien
  -- tiene la sesion abierta.
  add column if not exists conto         text,
  add column if not exists cerrado_en    timestamptz,
  add column if not exists cerrado_por   uuid references public.usuarios(id),
  -- null mientras esta abierto; al cerrar: pendiente o sin_diferencias.
  add column if not exists ajuste        text,
  add column if not exists ajuste_en     timestamptz,
  add column if not exists ajuste_por    uuid references public.usuarios(id),
  add column if not exists ajuste_nota   text,
  -- Rutas dentro del bucket privado `actas`. Las escribe el servidor.
  add column if not exists acta_pdf        text,
  add column if not exists acta_xlsx       text,
  add column if not exists valorizada_pdf  text,
  add column if not exists valorizada_xlsx text;

alter table public.conteos drop constraint if exists conteos_departamento_fk;
alter table public.conteos add constraint conteos_departamento_fk
  foreign key (empresa_id, departamento) references public.departamentos (empresa_id, codigo);

create unique index if not exists conteos_numero_unico on public.conteos (empresa_id, numero) where numero is not null;


-- ---------------------------------------------------------------- 2. RENGLONES
alter table public.conteo_lineas
  -- El N° de la planilla, para que el acta siga el orden del papel.
  add column if not exists renglon            integer,
  -- Nombre y unidad tal como estaban al contar: si mañana cambian en Valery,
  -- el acta sigue diciendo lo que se conto.
  add column if not exists nombre             text,
  add column if not exists unidad             text,
  add column if not exists observacion        text,
  -- La existencia del sistema en el momento de CERRAR. null = abierto.
  add column if not exists existencia_sistema numeric(14,3),
  add column if not exists anotado_por        uuid references public.usuarios(id),
  add column if not exists actualizado_en     timestamptz not null default now();


-- ---------------------------------------------------------------- 3. COSTOS DEL ACTA VALORIZADA
-- Tabla aparte, y no una columna en conteo_lineas: los renglones los lee
-- cualquiera que cuente, y el costo solo owner y admin. Se congela al cerrar:
-- el acta dice lo que valia la diferencia ESE dia.
create table if not exists public.conteo_costos (
  conteo_id      bigint not null references public.conteos(id) on delete cascade,
  codigo         text   not null,
  costo_unitario numeric(14,4) not null,   -- sin IVA, como en productos
  primary key (conteo_id, codigo)
);
alter table public.conteo_costos enable row level security;
drop policy if exists conteo_costos_lectura on public.conteo_costos;
create policy conteo_costos_lectura on public.conteo_costos
  for select using (
    public.puede_finanzas()
    and exists (select 1 from public.conteos c where c.id = conteo_id and public.puede_empresa(c.empresa_id))
  );
-- Sin politica de escritura: solo la escribe cerrar_conteo().


-- ---------------------------------------------------------------- 4. EVENTOS (el historial)
create table if not exists public.conteo_eventos (
  id         bigserial primary key,
  conteo_id  bigint not null references public.conteos(id) on delete cascade,
  en         timestamptz not null default now(),
  -- abierto | articulo_nuevo | cerrado | acta_generada | ajuste_aprobado | ajuste_rechazado
  tipo       text not null,
  detalle    text,
  usuario_id uuid references public.usuarios(id)
);
create index if not exists conteo_eventos_conteo on public.conteo_eventos (conteo_id, en);
alter table public.conteo_eventos enable row level security;
drop policy if exists conteo_eventos_lectura on public.conteo_eventos;
create policy conteo_eventos_lectura on public.conteo_eventos
  for select using (exists (select 1 from public.conteos c where c.id = conteo_id));
-- Sin politica de escritura, a proposito: el historial no se edita. Lo
-- escriben solo las funciones y el disparador de abajo.


-- ---------------------------------------------------------------- 5. PRODUCTOS: FICHA DEL ARTICULO NUEVO
-- Los campos de "Informacion General" de la ficha de Valery.
alter table public.productos
  add column if not exists nombre_corto text,
  add column if not exists marca        text,
  add column if not exists modelo       text,
  add column if not exists referencia   text;
-- productos tiene permisos POR COLUMNA (05-correcciones): sin esto, pedir
-- estas columnas falla para todo usuario que no sea el servicio.
grant select (nombre_corto, marca, modelo, referencia) on public.productos to authenticated;


-- ---------------------------------------------------------------- 6. NUMEROS
-- Misma tabla y mismo bloqueo que siguiente_correlativo(), con una clave por
-- año: asi el numero reinicia en enero sin otra maquinaria. Arranca en 1, no
-- en 45.200: el alto rango es para documentos que ve el cliente, y el conteo
-- es interno.
--
-- La fecha es la de Venezuela, no la del servidor (UTC): un conteo cerrado el
-- 31 de diciembre a las 9 de la noche es de ese año.
create or replace function public.numero_conteo(p_empresa text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  hoy   date := (now() at time zone 'America/Caracas')::date;
  clave text := 'conteo_' || to_char(hoy, 'YYYY');
  n     bigint;
begin
  insert into public.correlativos (empresa_id, tipo, siguiente) values (p_empresa, clave, 1)
  on conflict (empresa_id, tipo) do nothing;
  update public.correlativos set siguiente = siguiente + 1
   where empresa_id = p_empresa and tipo = clave
  returning siguiente - 1 into n;
  return 'CF-' || to_char(hoy, 'YYYY') || '-' || lpad(n::text, 6, '0');
end $$;
-- Solo la llama cerrar_conteo(): nadie tiene que poder gastar numeros.
revoke execute on function public.numero_conteo(text) from public, anon, authenticated;

create or replace function public.sku_macedonia(p_empresa text)
returns text
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  insert into public.correlativos (empresa_id, tipo, siguiente) values (p_empresa, 'sku_macedonia', 1)
  on conflict (empresa_id, tipo) do nothing;
  update public.correlativos set siguiente = siguiente + 1
   where empresa_id = p_empresa and tipo = 'sku_macedonia'
  returning siguiente - 1 into n;
  return 'MC-' || lpad(n::text, 6, '0');
end $$;
revoke execute on function public.sku_macedonia(text) from public, anon, authenticated;


-- ---------------------------------------------------------------- 7. CONTEOS CERRADOS ANTES DE ESTA MIGRACION
-- Si alguien cerro un conteo con el boton viejo, no tiene numero ni foto de la
-- existencia. Se le asigna numero ahora y se toma la existencia de este
-- momento, que es lo mejor que queda, y el historial lo dice.
do $$
declare c record; n text;
begin
  for c in select id, empresa_id, created_at from public.conteos
            where cerrado and numero is null order by id loop
    update public.conteo_lineas l
       set existencia_sistema = coalesce((select e.existencia from public.existencias e
                                           where e.empresa_id = c.empresa_id and e.codigo = l.codigo), 0),
           nombre = coalesce(l.nombre, (select p.nombre from public.productos p where p.empresa_id = c.empresa_id and p.codigo = l.codigo)),
           unidad = coalesce(l.unidad, (select p.unidad from public.productos p where p.empresa_id = c.empresa_id and p.codigo = l.codigo))
     where l.conteo_id = c.id;
    n := public.numero_conteo(c.empresa_id);
    update public.conteos set numero = n, cerrado_en = coalesce(cerrado_en, c.created_at), ajuste = 'pendiente' where id = c.id;
    insert into public.conteo_eventos (conteo_id, tipo, detalle)
    values (c.id, 'cerrado', 'Cerrado antes de la migración 23: se le asignó ' || n || ' al migrar, y la existencia del sistema es la del momento de la migración, no la del cierre.');
  end loop;
end $$;

alter table public.conteos drop constraint if exists conteo_cierre_coherente;
alter table public.conteos add constraint conteo_cierre_coherente check (
  (not cerrado and numero is null and ajuste is null)
  or (cerrado and numero is not null and cerrado_en is not null
      and ajuste in ('pendiente', 'aprobado', 'rechazado', 'sin_diferencias'))
);


-- ---------------------------------------------------------------- 8. UN CONTEO CERRADO NO CAMBIA
-- Las reglas viven en la base, no en la pantalla:
--   · Un usuario (rol `authenticated`) abre, anota y borra renglones de un
--     conteo ABIERTO, y nada mas. No puede cerrarlo, numerarlo, ni tocar el
--     ajuste: eso pasa solo por cerrar_conteo(), aprobar_ajuste() y
--     rechazar_ajuste(), que verifican el permiso de quien las llama.
--   · Esas funciones son security definer: dentro de ellas current_user es el
--     dueño de la base, y por eso pueden escribir lo que al usuario no se le deja.
--   · El servidor (service_role) guarda las rutas de las actas, una sola vez.
--   · Un conteo cerrado no se borra, y sus renglones no cambian para nadie.
create or replace function public.conteo_inmutable()
returns trigger
language plpgsql as $$
declare
  v_cerrado    boolean;
  privilegiado boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_table_name = 'conteos' then
    if tg_op = 'DELETE' then
      if old.cerrado then
        raise exception 'El conteo % está cerrado y no se borra. Si hubo un error, se hace un conteo nuevo.', old.numero;
      end if;
      return old;
    end if;

    if not privilegiado then
      if tg_op = 'UPDATE' and old.cerrado then
        raise exception 'El conteo % está cerrado: no se modifica.', old.numero;
      end if;
      if new.cerrado or new.numero is not null or new.cerrado_en is not null or new.cerrado_por is not null
         or new.ajuste is not null or new.ajuste_en is not null or new.ajuste_por is not null or new.ajuste_nota is not null
         or new.acta_pdf is not null or new.acta_xlsx is not null or new.valorizada_pdf is not null or new.valorizada_xlsx is not null then
        raise exception 'Un conteo se cierra y se ajusta con cerrar_conteo() y aprobar_ajuste(), no cambiando sus campos.';
      end if;
      return new;
    end if;

    if tg_op = 'UPDATE' and old.cerrado then
      if (new.numero, new.empresa_id, new.fecha, new.departamento, new.conto, new.zona, new.cerrado, new.cerrado_en, new.cerrado_por)
         is distinct from
         (old.numero, old.empresa_id, old.fecha, old.departamento, old.conto, old.zona, old.cerrado, old.cerrado_en, old.cerrado_por) then
        raise exception 'El conteo % está cerrado: sus datos no cambian.', old.numero;
      end if;
      -- Un acta archivada no se reemplaza.
      if (old.acta_pdf is not null and new.acta_pdf is distinct from old.acta_pdf)
         or (old.acta_xlsx is not null and new.acta_xlsx is distinct from old.acta_xlsx)
         or (old.valorizada_pdf is not null and new.valorizada_pdf is distinct from old.valorizada_pdf)
         or (old.valorizada_xlsx is not null and new.valorizada_xlsx is distinct from old.valorizada_xlsx) then
        raise exception 'El acta de % ya está archivada: no se reemplaza.', old.numero;
      end if;
    end if;
    return new;
  end if;

  -- conteo_lineas
  select c.cerrado into v_cerrado from public.conteos c where c.id = coalesce(new.conteo_id, old.conteo_id);
  if coalesce(v_cerrado, false) then
    raise exception 'El conteo está cerrado: sus renglones no cambian. Si hubo un error, se hace un conteo nuevo.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' then new.actualizado_en := now(); end if;
  -- La foto de la existencia la pone cerrar_conteo(), no quien anota.
  if not privilegiado and new.existencia_sistema is not null then
    raise exception 'La existencia del sistema se toma al cerrar, no al anotar.';
  end if;
  return new;
end $$;

drop trigger if exists conteos_inmutable on public.conteos;
create trigger conteos_inmutable before insert or update or delete on public.conteos
  for each row execute function public.conteo_inmutable();
drop trigger if exists conteo_lineas_inmutable on public.conteo_lineas;
create trigger conteo_lineas_inmutable before insert or update or delete on public.conteo_lineas
  for each row execute function public.conteo_inmutable();

-- Abrir un conteo queda en el historial sin que la app tenga que acordarse.
create or replace function public.conteo_abierto_evento()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.conteo_eventos (conteo_id, tipo, detalle, usuario_id)
  values (new.id, 'abierto',
          coalesce('Departamento ' || (select d.codigo || ' - ' || d.nombre from public.departamentos d
                                        where d.empresa_id = new.empresa_id and d.codigo = new.departamento),
                   'Zona ' || new.zona, 'Sin departamento') || '.',
          new.usuario_id);
  return new;
end $$;
drop trigger if exists conteos_evento_abierto on public.conteos;
create trigger conteos_evento_abierto after insert on public.conteos
  for each row execute function public.conteo_abierto_evento();


-- ---------------------------------------------------------------- 9. CERRAR
-- Numero + foto de la existencia y del costo + historial, todo en una
-- transaccion: o queda cerrado entero, o no queda.
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
  if not found then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede('inventory')) then
    raise exception 'Sin permiso para cerrar conteos de %.', c.empresa_id;
  end if;
  if c.cerrado then raise exception 'El conteo ya estaba cerrado: %.', c.numero; end if;

  select count(*) into v_lineas from public.conteo_lineas where conteo_id = p_conteo;
  if v_lineas = 0 then raise exception 'No se contó ningún producto todavía.'; end if;

  -- Si la pantalla no manda quien conto, queda quien cerro.
  v_conto := coalesce(nullif(trim(p_conto), ''), (select u.nombre from public.usuarios u where u.id = auth.uid()));

  -- Los renglones primero: una vez cerrado, el disparador no deja tocarlos.
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


-- ---------------------------------------------------------------- 10. AJUSTAR (owner o admin)
-- Cada diferencia pasa a ser un movimiento de inventario con motivo, como pide
-- la regla de ajustes. Se aplica la diferencia MEDIDA al cerrar, no la de hoy:
-- lo que se vendio despues del conteo ya esta en sus propios movimientos.
create or replace function public.aprobar_ajuste(p_conteo bigint, p_nota text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  c   public.conteos%rowtype;
  hoy date := (now() at time zone 'America/Caracas')::date;
  n   integer;
begin
  select * into c from public.conteos where id = p_conteo for update;
  if not found then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo un owner o admin aprueba ajustes de inventario.';
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
  if not found then raise exception 'No existe el conteo %.', p_conteo; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas()) then
    raise exception 'Solo un owner o admin decide sobre un ajuste.';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Decí por qué se rechaza: sin motivo nadie sabe qué recontar.';
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


-- ---------------------------------------------------------------- 11. ARTICULO NUEVO (SKU de Macedonia)
-- El SKU lo da la base: dos personas contando a la vez no pueden sacar el
-- mismo. Entra con costo y precio en 0 (ficha incompleta): quien cuenta no
-- siempre puede ver costos, y se completa en Productos.
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
  if not (public.puede_empresa(p_empresa) and public.puede('inventory')) then
    raise exception 'Sin permiso para crear artículos en %.', p_empresa;
  end if;
  if v_nombre = '' then raise exception 'Falta el nombre.'; end if;
  if coalesce(trim(p_unidad), '') = '' then raise exception 'Falta la unidad.'; end if;
  if not exists (select 1 from public.departamentos where empresa_id = p_empresa and codigo = p_departamento) then
    raise exception 'El departamento % no existe.', coalesce(p_departamento, '(vacío)');
  end if;
  -- Un mismo articulo con dos identificaciones es justo lo que hay que evitar.
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


-- ---------------------------------------------------------------- 12. RESUMEN PARA EL HISTORIAL
-- Columnas una por una, a proposito: con `c.*` la vista tampoco veria las que
-- se agreguen despues, pero sin avisar.
drop view if exists public.conteos_resumen;
create view public.conteos_resumen with (security_invoker = on) as
select c.id, c.empresa_id, c.numero, c.fecha, c.departamento, d.nombre as departamento_nombre, c.zona,
       c.conto, c.cerrado, c.cerrado_en, c.ajuste, c.ajuste_en, c.ajuste_nota, c.created_at as abierto_en,
       c.acta_pdf, c.acta_xlsx, c.valorizada_pdf, c.valorizada_xlsx,
       count(l.id)::integer as renglones,
       (count(l.id) filter (where l.existencia_sistema is not null and l.cantidad <> l.existencia_sistema))::integer as diferencias,
       (count(l.id) filter (where l.codigo like 'MC-%'))::integer as articulos_nuevos
  from public.conteos c
  left join public.departamentos d on d.empresa_id = c.empresa_id and d.codigo = c.departamento
  left join public.conteo_lineas l on l.conteo_id = c.id
 group by c.id, d.nombre;


-- ---------------------------------------------------------------- 13. BUCKET DE ACTAS
-- Privado: las actas llevan existencias, y las valorizadas costos. Se leen con
-- enlaces firmados de pocos minutos, como los comprobantes.
--   actas/<empresa>/<numero>/acta.pdf | acta.xlsx
--   actas/<empresa>/<numero>/valorizada/valorizada.pdf | valorizada.xlsx
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('actas', 'actas', false, 10485760,
        array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

drop policy if exists actas_lee on storage.objects;
create policy actas_lee on storage.objects
  for select using (
    bucket_id = 'actas'
    and public.puede_empresa((storage.foldername(name))[1])
    and public.puede('inventory')
    -- La carpeta `valorizada` solo la abre quien puede ver costos.
    and ((storage.foldername(name))[3] is distinct from 'valorizada' or public.puede_finanzas())
  );
-- Sin politica para subir, cambiar ni borrar: las sube el servidor al cerrar,
-- y un acta archivada no se reemplaza.


-- ---------------------------------------------------------------- COMPROBACION
-- Debe devolver todo en «si».
select
  (select case when count(*) = 14 then 'si' else 'NO' end from information_schema.columns
    where table_schema = 'public' and table_name = 'conteos'
      and column_name in ('numero','departamento','conto','cerrado_en','cerrado_por','ajuste','ajuste_en','ajuste_por',
                          'ajuste_nota','acta_pdf','acta_xlsx','valorizada_pdf','valorizada_xlsx','zona')) as conteos_listo,
  (select case when count(*) = 7 then 'si' else 'NO' end from information_schema.columns
    where table_schema = 'public' and table_name = 'conteo_lineas'
      and column_name in ('renglon','nombre','unidad','observacion','existencia_sistema','anotado_por','actualizado_en')) as renglones_listos,
  (select case when to_regclass('public.conteo_eventos') is not null and to_regclass('public.conteo_costos') is not null
               then 'si' else 'NO' end) as historial_y_costos,
  (select case when count(*) = 4 then 'si' else 'NO' end from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('cerrar_conteo','aprobar_ajuste','rechazar_ajuste','crear_articulo_nuevo')) as funciones,
  (select case when not public then 'si' else 'NO' end from storage.buckets where id = 'actas') as bucket_privado,
  (select case when count(*) filter (where cerrado and numero is null) = 0 then 'si' else 'NO' end from public.conteos) as cerrados_con_numero;
