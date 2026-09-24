import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { leerCantidad, vaEntera } from "./cantidad.ts";
import { armarActa, valorizar, esSkuMacedonia, fmtDif, fmtNum, fmtUsdSigno, type LineaEntrada } from "./acta.ts";

describe("leer la cantidad contada", () => {
  test("vacío, cero y mal escrito son tres cosas distintas", () => {
    // Vacio = no se conto. Cero = se conto y no hay. Confundirlos inventa un
    // faltante que nadie verifico.
    assert.deepEqual(leerCantidad(""), { estado: "vacio" });
    assert.deepEqual(leerCantidad("   "), { estado: "vacio" });
    assert.deepEqual(leerCantidad("0"), { estado: "cero", valor: 0 });
    assert.equal(leerCantidad("1,2,3").estado, "error");
    assert.equal(leerCantidad("abc").estado, "error");
  });

  test("coma decimal y punto de miles, como se escribe aquí", () => {
    assert.deepEqual(leerCantidad("212,5"), { estado: "ok", valor: 212.5 });
    assert.deepEqual(leerCantidad("1.600"), { estado: "ok", valor: 1600 });
    assert.deepEqual(leerCantidad("1.234,75"), { estado: "ok", valor: 1234.75 });
  });

  test("no acepta negativos", () => {
    assert.equal(leerCantidad("-3").estado, "error");
  });

  test("las unidades que no se parten", () => {
    assert.equal(vaEntera("UND"), true);
    assert.equal(vaEntera("par"), true);
    assert.equal(vaEntera("KG"), false);
    assert.equal(vaEntera("LBS"), false);
  });
});

const linea = (o: Partial<LineaEntrada>): LineaEntrada => ({
  renglon: null, codigo: "X", nombre: "X", unidad: "UND", cantidad: 0, existencia_sistema: 0, observacion: null, ...o,
});

// El conteo de SOLDADURA de las actas de ejemplo (CF-2026-000001).
const ejemplo = () => armarActa({
  numero: "CF-2026-000001", empresa: "Sumigases Oriente, C.A.", departamento: "05 - SOLDADURA",
  fecha: "23-09-2026", conto: "Técnico de almacén", abiertoEn: "23-09-2026 11:22", cerradoEn: "23-09-2026 15:40",
  eventos: [],
  lineas: [
    linea({ renglon: 1, codigo: "E701018HF", unidad: "KG", cantidad: 365.25, existencia_sistema: 367.48 }),
    linea({ renglon: 2, codigo: "E601018HF", unidad: "KG", cantidad: 60, existencia_sistema: 60 }),
    linea({ renglon: 5, codigo: "E60105/32L", unidad: "KG", cantidad: 270, existencia_sistema: 268 }),
    linea({ renglon: 8, codigo: "4009MPR", unidad: "KG", cantidad: 0, existencia_sistema: 1.9000000000000057 }),
    linea({ renglon: 12, codigo: "2001912", cantidad: 448, existencia_sistema: 450 }),
    linea({ renglon: 13, codigo: "SM4827F", cantidad: 6, existencia_sistema: 7 }),
    // Articulo nuevo: al cerrar la base le pone existencia 0.
    linea({ renglon: null, codigo: "MC-000001", cantidad: 6, existencia_sistema: 0 }),
  ],
});

describe("el acta de un conteo", () => {
  test("cuenta coincidencias, faltantes, sobrantes y nuevos como el acta de ejemplo", () => {
    const a = ejemplo();
    assert.deepEqual(a.resumen, { renglones: 7, coinciden: 1, faltantes: 4, sobrantes: 1, nuevos: 1, sinContar: 0 });
  });

  test("redondea el ruido de Valery: 1,9000000000000057 es 1,9", () => {
    const a = ejemplo();
    const l = a.lineas.find((x) => x.codigo === "4009MPR")!;
    assert.equal(l.sistema, 1.9);
    assert.equal(l.diferencia, -1.9);
  });

  test("un artículo nuevo no tiene sistema ni diferencia, aunque la base le ponga 0", () => {
    const l = ejemplo().lineas.find((x) => x.codigo === "MC-000001")!;
    assert.equal(l.esNuevo, true);
    assert.equal(l.sistema, null);
    assert.equal(l.diferencia, null);
  });

  test("sigue el orden del papel, y lo agregado va al final", () => {
    const orden = ejemplo().lineas.map((l) => l.renglon);
    assert.deepEqual(orden, [1, 2, 5, 8, 12, 13, null]);
  });

  test("solo MC- con seis dígitos es un SKU de Macedonia", () => {
    assert.equal(esSkuMacedonia("MC-000001"), true);
    assert.equal(esSkuMacedonia("MC-EPP-0001"), false);
    assert.equal(esSkuMacedonia("PIN-1112"), false);
  });
});

describe("el acta valorizada", () => {
  const costos = new Map([["E701018HF", 3.08], ["E60105/32L", 6.7599], ["4009MPR", 35.1326], ["2001912", 0.44], ["SM4827F", 166.9681]]);

  test("da los mismos totales que el acta valorizada de ejemplo", () => {
    const v = valorizar(ejemplo(), costos);
    assert.deepEqual(v.valor, { faltantes: -241.47, sobrantes: 13.52, neto: -227.95, sinCosto: 1 });
  });

  test("solo lista lo que tiene diferencia, y los nuevos", () => {
    const v = valorizar(ejemplo(), costos);
    assert.deepEqual(v.lineas.map((l) => l.codigo), ["E701018HF", "E60105/32L", "4009MPR", "2001912", "SM4827F", "MC-000001"]);
  });

  test("sin costo no inventa un valor", () => {
    const v = valorizar(ejemplo(), new Map());
    assert.ok(v.lineas.every((l) => l.valor === null));
    assert.equal(v.valor.neto, 0);
  });
});

describe("formato del acta", () => {
  test("números venezolanos con el signo menos tipográfico", () => {
    assert.equal(fmtNum(1600), "1.600");
    assert.equal(fmtNum(-2.23), "−2,23");
    assert.equal(fmtDif(2), "+2");
    assert.equal(fmtDif(0), "0");
    assert.equal(fmtDif(null), "nuevo");
    assert.equal(fmtUsdSigno(-241.47), "−$241,47");
    assert.equal(fmtUsdSigno(13.52), "+$13,52");
  });
});
