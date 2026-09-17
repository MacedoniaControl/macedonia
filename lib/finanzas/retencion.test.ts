import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { retencionDe, PCT_RETENCION, CLASES, claseDeDocumento } from "./retencion.ts";

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

// Greeg: "las 40 cuentas que existen dejalas asi como estan en total y deja
// para poder editarlas si necesitan colocar el iva que lo coloquen manual".
//
// El formulario recalculaba el monto desde BI + IVA, asi que al agregarle el
// IVA a una cuenta de Valery se le cambiaba el total. Esa cifra es la que
// mando Angy: es la unica que no se toca.
describe("editar una cuenta no le cambia el total", () => {
  const src = fs.readFileSync("components/finanzas/EditarCuenta.tsx", "utf8");

  test("el monto sale del campo, no de la suma del desglose", () => {
    assert.match(src, /const monto = parseMonto\(montoManual\)/);
    assert.doesNotMatch(src, /const monto = totalCalc \?\?/);
  });

  test("el campo del monto se ve siempre, haya desglose o no", () => {
    // Antes se escondia cuando habia BI e IVA, y entonces el total cambiaba
    // sin que nadie lo viera.
    assert.doesNotMatch(src, /totalCalc === null && \(\s*<CampoMonto etiqueta="Monto/);
    assert.match(src, /<CampoMonto etiqueta="Monto total \*"/);
  });

  test("si el desglose no cuadra con el total, avisa en vez de corregirlo", () => {
    assert.match(src, /No suma el monto total/);
    assert.match(src, /const descuadre =/);
  });
});

// La misma regla que usa la migracion 21. Vive en el codigo para que la
// pantalla pueda mostrar la clase antes de que exista la columna.
describe("claseDeDocumento", () => {
  test("NDE es nota de débito, NE es nota de entrega", () => {
    // Es la distincion que Greeg confirmo. Si se confunden, las 11 cuentas
    // NDE ya cargadas quedan clasificadas mal.
    assert.equal(claseDeDocumento("NDE-46992"), "nota_debito");
    assert.equal(claseDeDocumento("NE-0000017809·AVANTI"), "nota_entrega");
  });

  test("FCM es factura, y lo desconocido también", () => {
    assert.equal(claseDeDocumento("FCM-2192"), "factura");
    // Una cuenta escrita a mano sin prefijo es una factura: es lo mas comun,
    // y de todas formas se puede corregir al editarla.
    assert.equal(claseDeDocumento("12345"), "factura");
  });

  test("no se confunde con un nombre que empiece igual", () => {
    // "NEGOCIO-1" empieza por NE pero no es una nota de entrega.
    assert.equal(claseDeDocumento("NEGOCIO-1"), "factura");
  });

  test("ignora mayúsculas y espacios", () => {
    assert.equal(claseDeDocumento("  nde-500 "), "nota_debito");
  });
});
