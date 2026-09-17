import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { retencionDe, PCT_RETENCION, CLASES } from "./retencion.ts";

// El IVA retenido es el 75% del IVA de la cuenta: el comprador lo retiene y se
// lo entera al SENIAT, asi que al proveedor le paga el total MENOS eso.
describe("retención de IVA", () => {
  test("es el 75% del IVA", () => {
    assert.equal(PCT_RETENCION, 0.75);
    assert.equal(retencionDe(100, true), 75);
    assert.equal(retencionDe(57.46, true), 43.1);   // 43.095 redondeado
  });

  test("sin IVA no hay nada que retener", () => {
    // Las 40 cuentas ya cargadas no traen IVA: los archivos de Angy solo
    // daban el total. Devolver cero es correcto; inventarlo no.
    assert.equal(retencionDe(null, true), 0);
    assert.equal(retencionDe(0, true), 0);
  });

  test("una cuenta que no retiene no retiene aunque tenga IVA", () => {
    // Una nota de entrega no es documento fiscal. Greeg pidio poder decirlo
    // cuenta por cuenta.
    assert.equal(retencionDe(100, false), 0);
  });

  test("redondea a centimos: un tercer decimal no existe en dinero", () => {
    assert.equal(retencionDe(33.33, true), 25);      // 24.9975
    assert.equal(retencionDe(10.01, true), 7.51);    // 7.5075
  });
});

describe("clases de documento", () => {
  test("NDE es nota de débito, no de entrega", () => {
    // Confirmado por Greeg. En las cuentas por COBRAR el prefijo de nota de
    // entrega es NE; NDE es otra cosa, y confundirlas clasificaria mal las 11
    // cuentas que ya estan cargadas con ese prefijo.
    const sql = fs.readFileSync("supabase/21-cuentas-historial.sql", "utf8");
    assert.match(sql, /documento like 'NDE-%'[\s\S]{0,40}nota_debito|clase = 'nota_debito'\s+where[^;]*'NDE-%'/);
    assert.doesNotMatch(sql, /clase = 'nota_entrega'\s+where clase is null and documento like 'NDE-%'/);
  });

  test("están las cuatro clases que pueden aparecer", () => {
    assert.deepEqual(CLASES.map((c) => c.id),
      ["factura", "nota_entrega", "nota_debito", "nota_credito"]);
  });
});

describe("cerrar una cuenta", () => {
  const src = fs.readFileSync("lib/finanzas/cuentas-db.ts", "utf8");

  test("cerrar con saldo pendiente exige explicación", () => {
    // Dentro de seis meses nadie se acuerda de por que se cerro debiendo.
    assert.match(src, /como === "abono" && !nota\?\.trim\(\)/);
  });

  test("no se puede cerrar como pago total si queda saldo", () => {
    assert.match(src, /como === "total" && saldo > 0\.009/);
  });

  test("si el abono falla, el comprobante no se queda huérfano", () => {
    assert.match(src, /if \(ruta\) await sb\.storage\.from\(BUCKET_COMPROBANTES\)\.remove/);
  });

  test("editar no puede dejar el monto por debajo de lo abonado", () => {
    assert.match(src, /c\.monto < abonado/);
  });
});
