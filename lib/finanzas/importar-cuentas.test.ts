import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { leerCartera, aNumero, aFecha } from "./importar-cuentas.ts";

describe("aNumero", () => {
  test("formato venezolano: punto de miles, coma decimal", () => {
    assert.equal(aNumero("1.234,56"), 1234.56);
    assert.equal(aNumero("17.376,44"), 17376.44);
  });
  test("formato ingles: coma de miles, punto decimal", () => {
    assert.equal(aNumero("1,234.56"), 1234.56);
  });
  test("coma sola con dos decimales es decimal", () => {
    assert.equal(aNumero("84,00"), 84);
    assert.equal(aNumero("195,5"), 195.5);
  });
  test("coma sola con tres digitos detras es de miles", () => {
    assert.equal(aNumero("1,234"), 1234);
  });
  test("saca el simbolo de moneda y los espacios", () => {
    assert.equal(aNumero(" $ 528,00 "), 528);
  });
  test("vacio o basura devuelve null, no NaN", () => {
    assert.equal(aNumero(""), null);
    assert.equal(aNumero("   "), null);
    assert.equal(aNumero("abc"), null);
  });
});

describe("aFecha", () => {
  test("ISO pasa tal cual", () => {
    assert.equal(aFecha("2026-08-26"), "2026-08-26");
  });
  test("dd/mm/aaaa se convierte", () => {
    assert.equal(aFecha("26/08/2026"), "2026-08-26");
    assert.equal(aFecha("5/8/2026"), "2026-08-05");
  });
  test("dd-mm-aaaa tambien", () => {
    assert.equal(aFecha("26-08-2026"), "2026-08-26");
  });
  test("lo que no entiende devuelve null en vez de una fecha inventada", () => {
    assert.equal(aFecha("ayer"), null);
    assert.equal(aFecha(""), null);
  });
});

describe("leerCartera", () => {
  const csv = [
    "Proveedor;Documento;Monto;Vence",
    "STAR GAS C,A;FCM-80036;4.796,48;30/08/2026",
    "OXIGENO DE ORIENTE;FCM-80152;1.652,00;05/09/2026",
  ].join("\n");

  test("lee las filas con punto y coma", () => {
    const r = leerCartera(csv);
    assert.equal(r.filas.length, 2);
    assert.equal(r.problemas.length, 0);
  });

  test("respeta el formato venezolano de los montos", () => {
    const r = leerCartera(csv);
    assert.equal(r.filas[0].monto, 4796.48);
    assert.equal(r.filas[1].monto, 1652);
  });

  test("convierte las fechas", () => {
    assert.equal(leerCartera(csv).filas[0].vence, "2026-08-30");
  });

  test("acepta tabulaciones, que es lo que sale al pegar de Excel", () => {
    const r = leerCartera("Cliente\tDocumento\tSaldo\nACME\tF-1\t100");
    assert.equal(r.filas.length, 1);
    assert.equal(r.filas[0].monto, 100);
  });

  test("reconoce columnas con otros nombres", () => {
    const r = leerCartera("Razon Social,Factura,Total\nACME,F-1,50");
    assert.equal(r.filas.length, 1);
    assert.equal(r.filas[0].contraparte, "ACME");
  });

  test("avisa si falta una columna obligatoria en vez de importar mal", () => {
    const r = leerCartera("Cliente,Monto\nACME,50");
    assert.equal(r.filas.length, 0);
    assert.match(r.problemas[0].motivo, /documento/i);
  });

  test("una fila mala no tumba las buenas, y queda reportada", () => {
    const r = leerCartera("Cliente;Documento;Monto\nACME;F-1;100\n;F-2;50\nOTRO;F-3;abc");
    assert.equal(r.filas.length, 1);
    assert.equal(r.problemas.length, 2);
    assert.equal(r.problemas[0].linea, 3);
  });

  test("un monto en cero o negativo no entra", () => {
    const r = leerCartera("Cliente;Documento;Monto\nACME;F-1;0\nOTRO;F-2;-5");
    assert.equal(r.filas.length, 0);
    assert.equal(r.problemas.length, 2);
  });

  test("sin fecha de vencimiento usa hoy, que aparece como vencida", () => {
    const r = leerCartera("Cliente;Documento;Monto\nACME;F-1;100");
    assert.equal(r.filas[0].vence, new Date().toISOString().slice(0, 10));
  });

  test("un archivo vacio no explota", () => {
    assert.equal(leerCartera("").filas.length, 0);
    assert.equal(leerCartera("solo cabecera").filas.length, 0);
  });
});
