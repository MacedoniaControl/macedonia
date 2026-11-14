-- 57 · El agente 1.0.8 ve todo lo de Valery
--
-- Pedido del usuario (13-11-2026): «quiero que el agente vea todo». El agente
-- 1.0.8 agrega diez lecturas de la copia de Valery (nunca escribe en Valery):
--
--   cierre        ventas con costo + compras con monto, para cerrar meses del histórico
--   rentabilidad  cada renglón de venta con su costo, vendedor y comisión
--   compras       compras con sus montos (y notas de crédito y débito de proveedores)
--   catalogo      el catálogo con costos, precios y mínimos y máximos
--   vendedores, clientes, proveedores   las fichas
--   caja          cómo se cobró y cómo se pagó (forma de pago, moneda, banco)
--   retenciones   comprobantes de IVA e ISLR, de proveedores y de clientes
--   bancos        movimientos de banco y saldo de cada cuenta (solo 4 dígitos)
--
-- Regla 5: el costo de compra está protegido. Las lecturas que traen costos
-- (cierre, rentabilidad, compras, catalogo) solo las pide y las ve quien,
-- además de ser Owner o Administrador de la empresa, tiene `ver_costos`. El
-- Owner siempre (puede() le devuelve true).
--
-- Se puede correr más de una vez.

begin;

-- ---------------------------------------------------------------- LOS TIPOS
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.valery_solicitudes'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%existencias%'
  loop
    execute format('alter table public.valery_solicitudes drop constraint %I', c);
  end loop;
end $$;
alter table public.valery_solicitudes add constraint valery_solicitudes_tipo_check
  check (tipo in ('ventas', 'cxc', 'cxp', 'existencias', 'estado', 'diagnostico', 'movimientos',
                  'cierre', 'rentabilidad', 'compras', 'catalogo', 'vendedores', 'clientes', 'proveedores',
                  'caja', 'retenciones', 'bancos'));

-- ---------------------------------------------------------------- LOS COSTOS
-- Un solo lugar dice qué lecturas traen costos.
create or replace function public.valery_tipo_con_costo(p_tipo text) returns boolean
language sql immutable as $$
  select p_tipo in ('cierre', 'rentabilidad', 'compras', 'catalogo')
$$;

drop policy if exists valery_solicitudes_pedir on public.valery_solicitudes;
create policy valery_solicitudes_pedir on public.valery_solicitudes for insert
  with check (public.puede_empresa(empresa_id) and public.puede_finanzas()
              and estado = 'pendiente' and creado_por = auth.uid()
              and (not public.valery_tipo_con_costo(tipo) or public.puede('ver_costos')));

drop policy if exists valery_resultados_lectura on public.valery_resultados;
create policy valery_resultados_lectura on public.valery_resultados for select
  using (exists (select 1 from public.valery_solicitudes s
                  where s.id = solicitud_id and public.puede_empresa(s.empresa_id) and public.puede_finanzas()
                    and (not public.valery_tipo_con_costo(s.tipo) or public.puede('ver_costos'))));

commit;

-- ---------------------------------------------------------------- COMPROBACIÓN
-- Debe decir: tipos 17, funcion 1, pedir 1, leer 1.
select
  (select (length(pg_get_constraintdef(oid)) - length(replace(pg_get_constraintdef(oid), '::text', ''))) / 6
     from pg_constraint where conname = 'valery_solicitudes_tipo_check') as tipos,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'valery_tipo_con_costo') as funcion,
  (select count(*) from pg_policies where tablename = 'valery_solicitudes' and policyname = 'valery_solicitudes_pedir'
    and with_check like '%ver_costos%') as pedir,
  (select count(*) from pg_policies where tablename = 'valery_resultados' and policyname = 'valery_resultados_lectura'
    and qual like '%ver_costos%') as leer;
