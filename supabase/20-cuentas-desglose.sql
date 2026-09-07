-- Desglose fiscal de una cuenta: base imponible, IVA y retencion.
--
-- Pedido por Greeg: el formulario solo tenia "monto", y la Relacion de Cuentas
-- por Pagar de Valery trae BI, IVA, Total Operacion e IVA Retenido (75%). Sin
-- esas cifras la cuenta se puede cobrar o pagar, pero no se puede conciliar
-- con el libro fiscal, que es donde termina discutiendose.
--
-- `monto` NO cambia de significado: sigue siendo lo que se debe. El desglose
-- lo explica, no lo reemplaza -asi las cuentas ya cargadas siguen valiendo-.

alter table cuentas
  add column if not exists base_imponible numeric(14,2),
  add column if not exists iva            numeric(14,2),
  add column if not exists iva_retenido   numeric(14,2);

-- Ninguna de las tres puede ser negativa. Se admiten nulas: las cuentas que ya
-- estan cargadas no traen desglose, y exigirlo ahora las invalidaria.
alter table cuentas drop constraint if exists desglose_no_negativo;
alter table cuentas add constraint desglose_no_negativo check (
  coalesce(base_imponible, 0) >= 0
  and coalesce(iva, 0) >= 0
  and coalesce(iva_retenido, 0) >= 0
);

comment on column cuentas.base_imponible is
  'BI del libro de compras. Nula en las cuentas cargadas antes del desglose.';
comment on column cuentas.iva is
  'IVA de la factura. Total de la operacion = base_imponible + iva.';
comment on column cuentas.iva_retenido is
  'IVA retenido (75% en Venezuela). Lo retiene el comprador y no se le paga al proveedor.';
