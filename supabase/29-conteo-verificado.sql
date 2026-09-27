-- 29 · Todo conteo del inventario se verifica
--
-- Antes solo se aprobaba un conteo con diferencias; uno «sin diferencias»
-- quedaba cerrado sin que nadie lo certificara. Ahora cada conteo cerrado
-- espera que el Owner o un Administrador lo VERIFIQUE: al verificarlo
-- certifica que es correcto y, si tiene diferencias, cada una entra a la
-- existencia como un movimiento de inventario. Sin diferencias, la existencia
-- no cambia, pero queda quién lo certificó y cuándo.
--
-- Mismas funciones (aprobar_ajuste, rechazar_ajuste): la pantalla las llama
-- «Verificar conteo» y «Rechazar». Ahora aceptan también 'sin_diferencias'.
-- Verificado queda como ajuste = 'aprobado'.
--
-- Se puede correr más de una vez.

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
    raise exception 'Solo el Owner o un Administrador verifica conteos de inventario.';
  end if;
  if not c.cerrado or c.ajuste not in ('pendiente', 'sin_diferencias') then
    raise exception 'El conteo % no está por verificar (está: %).', coalesce(c.numero, 'abierto'),
      case c.ajuste when 'aprobado' then 'verificado' when 'rechazado' then 'rechazado' else coalesce(c.ajuste, 'abierto') end;
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
  values (p_conteo, 'ajuste_aprobado',
          case when n = 0
               then 'Conteo verificado: sin diferencias, la existencia no cambia.'
               else 'Conteo verificado: ' || n || ' movimiento(s) de inventario con motivo «Conteo ' || c.numero || '».' end ||
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
    raise exception 'Solo el Owner o un Administrador decide sobre un conteo.';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Indica por qué se rechaza: sin motivo nadie sabe qué recontar.';
  end if;
  if not c.cerrado or c.ajuste not in ('pendiente', 'sin_diferencias') then
    raise exception 'El conteo % no está por verificar.', coalesce(c.numero, 'abierto');
  end if;
  update public.conteos set ajuste = 'rechazado', ajuste_en = now(), ajuste_por = auth.uid(), ajuste_nota = trim(p_nota)
   where id = p_conteo;
  insert into public.conteo_eventos (conteo_id, tipo, detalle, usuario_id)
  values (p_conteo, 'ajuste_rechazado', trim(p_nota), auth.uid());
end $$;
revoke execute on function public.rechazar_ajuste(bigint, text) from public, anon;
grant execute on function public.rechazar_ajuste(bigint, text) to authenticated;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir «si» y cuántos conteos esperan verificación.
select
  (select case when prosrc like '%''pendiente'', ''sin_diferencias''%' then 'si' else 'NO' end
     from pg_proc where proname = 'aprobar_ajuste' and pronamespace = 'public'::regnamespace) as verificar_listo,
  (select count(*) from public.conteos
    where cerrado and eliminado_en is null and ajuste in ('pendiente', 'sin_diferencias')) as conteos_por_verificar;
