-- 36 · Cuentas por cobrar: cartera propia y cartera de vendedores externos
--
-- Las dos formas a la vez, con una regla clara:
--   1. El CLIENTE puede tener un vendedor externo asignado (o ninguno = propia).
--   2. Cada CUENTA tiene su vendedor. Al crearse lo toma, en este orden:
--        a. el que se indique al cargarla (importar, anexar, nueva cuenta);
--        b. el de la nota de entrega de Macedonia con ese número y cliente, si
--           se emitió con «Vendedor externo»;
--        c. el del cliente.
--   3. Lo marcado en la cuenta (a o b) MANDA sobre el cliente: «vendedor_fijo».
--      Lo heredado del cliente se mueve si el cliente cambia de vendedor y se
--      pide «también las abiertas».
-- Si una cuenta se carga con un vendedor y su cliente no tiene ninguno, el
-- cliente queda asignado a ese vendedor.
--
-- Asignar o cambiar el vendedor de un cliente o de una cuenta lo hacen el
-- Owner o un Administrador: decide comisiones.
--
-- Arranque: las 128 cuentas que entraron del «Estado de Cuenta de Clientes
-- (Francisco)» son del vendedor externo Francisco, y sus 10 clientes quedan
-- asignados a él (confirmado por el usuario, 05-10-2026).
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------- 1. COLUMNAS Y TABLA
-- La nota de entrega ya guarda su vendedor externo; la columna se creó fuera de
-- las migraciones y aquí queda escrita (no cambia nada si ya existe).
alter table public.documentos add column if not exists vendedor_externo text;

alter table public.cuentas
  add column if not exists vendedor_externo text,
  add column if not exists vendedor_fijo boolean not null default false;
create index if not exists cuentas_vendedor on public.cuentas (empresa_id, tipo, vendedor_externo) where vendedor_externo is not null;

-- El mismo cliente escrito con espacios o mayúsculas distintas es el mismo.
create or replace function public.clave_cliente(s text) returns text
language sql immutable as $$ select upper(regexp_replace(trim(coalesce(s, '')), '\s+', ' ', 'g')) $$;

create table if not exists public.cliente_vendedor (
  empresa_id       text not null references public.empresas(id),
  cliente_clave    text not null,
  cliente          text not null,
  vendedor_externo text not null check (length(trim(vendedor_externo)) > 0),
  asignado_por     uuid references public.usuarios(id),
  asignado_nombre  text,
  asignado_en      timestamptz not null default now(),
  primary key (empresa_id, cliente_clave)
);
alter table public.cliente_vendedor enable row level security;
drop policy if exists cliente_vendedor_lectura on public.cliente_vendedor;
create policy cliente_vendedor_lectura on public.cliente_vendedor for select using (
  public.puede_empresa(empresa_id) and public.puede('receivables'));
grant select on public.cliente_vendedor to authenticated;

-- ---------------------------------------------------------------- 2. EL VENDEDOR AL CREAR LA CUENTA
create or replace function public.cuentas_vendedor()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_doc text;
begin
  if new.tipo <> 'cobrar' then
    new.vendedor_externo := null; new.vendedor_fijo := false;
    return new;
  end if;
  new.vendedor_externo := nullif(trim(new.vendedor_externo), '');
  if not new.vendedor_fijo then
    -- b. la nota de Macedonia con ese número y ese cliente, emitida con vendedor externo
    select d.vendedor_externo into v_doc
      from public.documentos d
     where d.empresa_id = new.empresa_id and d.tipo = 'nota_entrega' and d.vendedor_externo is not null
       and ltrim(d.correlativo, '0') = ltrim(regexp_replace(split_part(new.documento, '·', 1), '\D', '', 'g'), '0')
       and public.clave_cliente(d.cliente) = public.clave_cliente(new.contraparte)
     limit 1;
    if v_doc is not null then
      new.vendedor_externo := trim(v_doc); new.vendedor_fijo := true;
    else
      -- c. el del cliente
      select cv.vendedor_externo into new.vendedor_externo
        from public.cliente_vendedor cv
       where cv.empresa_id = new.empresa_id and cv.cliente_clave = public.clave_cliente(new.contraparte);
    end if;
  end if;
  -- Cargada con un vendedor y el cliente sin ninguno: el cliente queda con ese vendedor.
  if new.vendedor_fijo and new.vendedor_externo is not null then
    insert into public.cliente_vendedor (empresa_id, cliente_clave, cliente, vendedor_externo, asignado_por, asignado_nombre)
    values (new.empresa_id, public.clave_cliente(new.contraparte), trim(new.contraparte), new.vendedor_externo, auth.uid(),
            'Al cargar ' || coalesce(new.documento, 'la cuenta'))
    on conflict (empresa_id, cliente_clave) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists cuentas_vendedor on public.cuentas;
create trigger cuentas_vendedor before insert on public.cuentas
  for each row execute function public.cuentas_vendedor();

-- ---------------------------------------------------------------- 3. ASIGNAR AL CLIENTE
-- p_vendedor null o vacío = el cliente vuelve a la cartera propia.
-- p_mover_abiertas: también sus cuentas abiertas que lo heredaron del cliente
-- (las marcadas a mano en la cuenta no se tocan). Devuelve cuántas se movieron.
create or replace function public.asignar_vendedor_cliente(p_empresa text, p_cliente text, p_vendedor text, p_mover_abiertas boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ven   text := nullif(trim(p_vendedor), '');
  v_clave text := public.clave_cliente(p_cliente);
  v_nom   text;
  n       integer := 0;
begin
  if not (public.puede_empresa(p_empresa) and public.puede_finanzas() and public.puede('receivables')) then
    raise exception 'Asignar el vendedor de un cliente lo hacen el Owner o un Administrador.';
  end if;
  if v_clave = '' then raise exception 'Falta el cliente.'; end if;
  select u.nombre into v_nom from public.usuarios u where u.id = auth.uid();
  if v_ven is null then
    delete from public.cliente_vendedor where empresa_id = p_empresa and cliente_clave = v_clave;
  else
    insert into public.cliente_vendedor (empresa_id, cliente_clave, cliente, vendedor_externo, asignado_por, asignado_nombre)
    values (p_empresa, v_clave, trim(p_cliente), v_ven, auth.uid(), coalesce(v_nom, 'Sin nombre'))
    on conflict (empresa_id, cliente_clave) do update
      set vendedor_externo = excluded.vendedor_externo, cliente = excluded.cliente,
          asignado_por = excluded.asignado_por, asignado_nombre = excluded.asignado_nombre, asignado_en = now();
  end if;
  if p_mover_abiertas then
    update public.cuentas c set vendedor_externo = v_ven
     where c.empresa_id = p_empresa and c.tipo = 'cobrar' and c.estado = 'abierta' and not c.vendedor_fijo
       and public.clave_cliente(c.contraparte) = v_clave and c.vendedor_externo is distinct from v_ven;
    get diagnostics n = row_count;
  end if;
  return n;
end $$;
revoke execute on function public.asignar_vendedor_cliente(text, text, text, boolean) from public, anon;
grant execute on function public.asignar_vendedor_cliente(text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------- 4. ASIGNAR A UNA CUENTA
-- p_heredar: la cuenta vuelve a seguir al cliente (deja de estar marcada).
-- Si no, queda marcada con p_vendedor (null o vacío = cartera propia).
create or replace function public.asignar_vendedor_cuenta(p_id bigint, p_vendedor text, p_heredar boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.cuentas%rowtype;
  v text;
begin
  select * into c from public.cuentas where id = p_id for update;
  if not found or c.tipo <> 'cobrar' then raise exception 'No existe esa cuenta por cobrar.'; end if;
  if not (public.puede_empresa(c.empresa_id) and public.puede_finanzas() and public.puede('receivables')) then
    raise exception 'Cambiar el vendedor de una cuenta lo hacen el Owner o un Administrador.';
  end if;
  if p_heredar then
    select cv.vendedor_externo into v from public.cliente_vendedor cv
     where cv.empresa_id = c.empresa_id and cv.cliente_clave = public.clave_cliente(c.contraparte);
    update public.cuentas set vendedor_externo = v, vendedor_fijo = false where id = p_id;
  else
    v := nullif(trim(p_vendedor), '');
    update public.cuentas set vendedor_externo = v, vendedor_fijo = true where id = p_id;
  end if;
  return v;
end $$;
revoke execute on function public.asignar_vendedor_cuenta(bigint, text, boolean) from public, anon;
grant execute on function public.asignar_vendedor_cuenta(bigint, text, boolean) to authenticated;

-- ---------------------------------------------------------------- 5. ARRANQUE: LA CARTERA DE FRANCISCO
update public.cuentas
   set vendedor_externo = 'Francisco', vendedor_fijo = true
 where empresa_id = 'sumigases' and tipo = 'cobrar' and vendedor_externo is null
   and nota like 'Estado de Cuenta de Clientes (Francisco)%';

insert into public.cliente_vendedor (empresa_id, cliente_clave, cliente, vendedor_externo, asignado_nombre)
select distinct on (public.clave_cliente(c.contraparte)) 'sumigases', public.clave_cliente(c.contraparte), trim(c.contraparte),
       'Francisco', 'Estado de cuenta de Francisco (importación)'
  from public.cuentas c
 where c.empresa_id = 'sumigases' and c.tipo = 'cobrar' and c.vendedor_externo = 'Francisco'
on conflict (empresa_id, cliente_clave) do nothing;

-- ---------------------------------------------------------------- 6. COMPROBACIÓN
-- Debe decir: cuentas_francisco 128, clientes_francisco 10, funciones 2.
select
  (select count(*) from public.cuentas where empresa_id = 'sumigases' and tipo = 'cobrar' and vendedor_externo = 'Francisco') as cuentas_francisco,
  (select count(*) from public.cliente_vendedor where empresa_id = 'sumigases' and vendedor_externo = 'Francisco') as clientes_francisco,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('asignar_vendedor_cliente', 'asignar_vendedor_cuenta')) as funciones;
