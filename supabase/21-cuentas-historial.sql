-- Historial de una cuenta: que clase de documento es, si retiene, como va y
-- con que comprobante se abono.
--
-- Pedido por Greeg: cada cuenta por pagar tiene que poder abrirse y contar su
-- propia historia -cuanto se abono, cuando, con que comprobante, cuanto queda-
-- y poder cerrarse indicando si fue abono parcial o pago total.

-- Todo va calificado con `public.`: en el editor de Supabase el search_path
-- no siempre llega, y sin el prefijo falla con 'relation cuentas does not exist'.

-- ---------------------------------------------------------------------------
-- CLASE DE DOCUMENTO
--
-- Greeg pidio separar facturas de notas de entrega. Lo que hay cargado son
-- FCM (factura de compra) y NDE, que segun el es NOTA DE DEBITO, no de
-- entrega: el prefijo NE de las cuentas por cobrar es el de entrega. Se dejan
-- las cuatro clases para no tener que migrar otra vez cuando aparezcan.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.clase_cuenta as enum ('factura', 'nota_entrega', 'nota_debito', 'nota_credito', 'ajuste');
exception when duplicate_object then null; end $$;

alter table public.cuentas add column if not exists clase public.clase_cuenta;

-- Lo ya cargado se clasifica por su prefijo, que es de donde salio.
update public.cuentas set clase = 'ajuste'       where clase is null and documento like 'AJUSTE-%';
update public.cuentas set clase = 'factura'      where clase is null and documento like 'FCM-%';
update public.cuentas set clase = 'nota_debito'  where clase is null and documento like 'NDE-%';
update public.cuentas set clase = 'nota_entrega' where clase is null and documento like 'NE-%';
update public.cuentas set clase = 'factura'      where clase is null;

alter table public.cuentas alter column clase set default 'factura';
alter table public.cuentas alter column clase set not null;

-- ---------------------------------------------------------------------------
-- RETENCION
--
-- El IVA retenido es el 75% del IVA de la cuenta. Se guarda en vez de
-- calcularse al vuelo porque el porcentaje puede cambiar por ley, y una cuenta
-- vieja tiene que seguir diciendo lo que se retuvo ENTONCES.
--
-- `aplica_retencion` existe porque una nota de entrega no es documento fiscal:
-- Greeg pidio poder decir, cuenta por cuenta, si lleva retencion o no.
-- ---------------------------------------------------------------------------
alter table public.cuentas add column if not exists aplica_retencion boolean not null default true;

-- ---------------------------------------------------------------------------
-- ESTADO
--
-- No se deduce del saldo a proposito. Una cuenta se puede dar por liquidada
-- con un abono parcial -se negocio, se condono, se cruzo con otra- y el saldo
-- por si solo no sabe eso. Cerrarla es una decision de una persona, y queda
-- firmada.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.estado_cuenta as enum ('abierta', 'liquidada');
exception when duplicate_object then null; end $$;

alter table public.cuentas
  add column if not exists estado        public.estado_cuenta not null default 'abierta',
  add column if not exists liquidada_en  timestamptz,
  add column if not exists liquidada_por uuid references public.usuarios(id),
  -- 'abono' = se cerro sin pagarlo todo. 'total' = se pago completo.
  add column if not exists liquidada_como text,
  add column if not exists liquidada_nota text;

alter table public.cuentas drop constraint if exists liquidada_coherente;
alter table public.cuentas add constraint liquidada_coherente check (
  (estado = 'abierta'  and liquidada_en is null and liquidada_como is null)
  or (estado = 'liquidada' and liquidada_en is not null and liquidada_como in ('abono','total'))
);

-- ---------------------------------------------------------------------------
-- COMPROBANTE DEL ABONO
--
-- La imagen vive en Storage; aqui queda su ruta. Igual que con los PDF de
-- Valery: el bucket guarda el binario, la tabla guarda que es.
-- ---------------------------------------------------------------------------
alter table public.abonos add column if not exists imagen_ruta text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf'];

-- La ruta arranca con el id de empresa (comprobantes/sumigases/...), asi que
-- el primer tramo dice de quien es y se comprueba contra el permiso. Sin esto
-- cualquiera con sesion veria los comprobantes de la otra empresa.
drop policy if exists comprobantes_lee on storage.objects;
create policy comprobantes_lee on storage.objects
  for select using (
    bucket_id = 'comprobantes' and puede_empresa((storage.foldername(name))[1])
  );

drop policy if exists comprobantes_sube on storage.objects;
create policy comprobantes_sube on storage.objects
  for insert with check (
    bucket_id = 'comprobantes' and puede_empresa((storage.foldername(name))[1])
  );

drop policy if exists comprobantes_borra on storage.objects;
create policy comprobantes_borra on storage.objects
  for delete using (
    bucket_id = 'comprobantes'
    and puede_empresa((storage.foldername(name))[1])
    and auth_rol() in ('owner','admin')
  );

create index if not exists cuentas_estado on public.cuentas (empresa_id, tipo, estado);

-- ---------------------------------------------------------------------------
-- LA VISTA TAMBIEN
--
-- `cuentas_saldo` enumera sus columnas una por una, asi que agregarlas a la
-- tabla NO las hace aparecer aqui: la pantalla lee de la vista y seguiria sin
-- verlas. Sin este bloque la migracion corre sin quejarse y no cambia nada de
-- lo que se ve.
-- ---------------------------------------------------------------------------
drop view if exists public.cuentas_saldo;
create view public.cuentas_saldo with (security_invoker = on) as
select c.id, c.empresa_id, c.tipo, c.contraparte, c.documento,
       c.monto, c.moneda, c.emitida, c.vence, c.nota,
       c.clase, c.estado, c.aplica_retencion,
       c.base_imponible, c.iva, c.iva_retenido,
       coalesce(sum(a.monto), 0)::numeric(14,2)             as abonado,
       (c.monto - coalesce(sum(a.monto), 0))::numeric(14,2) as saldo,
       (c.vence - current_date)::integer                    as dias
from public.cuentas c
left join public.abonos a on a.cuenta_id = c.id
group by c.id;

comment on column public.cuentas.clase is 'Que documento es. NDE cargado de Valery es nota de DEBITO, no de entrega.';
comment on column public.cuentas.aplica_retencion is 'Falso para documentos no fiscales. El usuario lo decide por cuenta.';
comment on column public.cuentas.estado is 'Liquidar es una decision de una persona, no una consecuencia del saldo.';
comment on column public.abonos.imagen_ruta is 'Comprobante dentro del bucket privado comprobantes/<empresa>/...';
