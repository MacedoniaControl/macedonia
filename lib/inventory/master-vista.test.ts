import { test } from "node:test";
import assert from "node:assert/strict";
import { filasDe, prepararMaster, resumirMaster, vistaInicial } from "./master-vista.ts";
import { compararConValery } from "./comparar-valery.ts";

// `valery` en FilaMaster es la existencia del kardex de Macedonia (el nombre viene de cuando era copia de Valery).
const f = (codigo: string, existencia: number, contado: number | null, fecha: string | null, costo: number | null = 2) => ({
  codigo, nombre: `P ${codigo}`, unidad: "UND", costo, valery: existencia, contado, fechaConteo: fecha, zona: null,
  diferencia: contado === null ? null : contado - existencia,
});
const HOY = "2026-10-13";

test("nunca contado no es cero: va a «por contar»; el negativo, a su pregunta", () => {
  const fs = prepararMaster([f("A", 10, null, null), f("B", 0, null, null), f("C", -5, null, null)], HOY);
  const r = resumirMaster(fs);
  assert.equal(r.porContar, 1);          // solo A: tiene existencia y nadie lo contó
  assert.equal(r.negativos, 1);
  assert.deepEqual(filasDe(fs, "contar").map((x) => x.codigo), ["A"]);
  assert.deepEqual(filasDe(fs, "negativo").map((x) => x.codigo), ["C"]);
});

test("por contar: primero lo nunca contado, y dentro lo que más vale; un conteo viejo vuelve a la lista", () => {
  const fs = prepararMaster([
    f("BARATO", 100, null, null, 0.1), f("CARO", 5, null, null, 50), f("VIEJO", 50, 50, "2026-08-01"), f("RECIENTE", 50, 50, "2026-10-10"),
  ], HOY);
  assert.deepEqual(filasDe(fs, "contar").map((x) => x.codigo), ["CARO", "BARATO", "VIEJO"]);
  const r = resumirMaster(fs);
  assert.equal(r.verificados, 1);        // solo RECIENTE
  assert.equal(r.conExistencia, 4);
  assert.equal(vistaInicial(r), "contar");
});

test("un conteo de hace días no es un faltante: lo vendido después de contar no se marca", () => {
  // Se contaron 50 y después se vendieron 8: la existencia es 42. Antes salía «faltan 8».
  const r = resumirMaster(prepararMaster([f("X", 42, 50, "2026-10-10")], HOY));
  assert.deepEqual([r.porContar, r.distintas, r.negativos], [0, 0, 0]);
});

test("contra Valery: lo que no explica nada primero; lo que explican los conteos, dicho; y lo que solo Valery tiene", () => {
  const filas = [f("2702PD-500", 1019, null, null), f("8004202", 32, 98, "2026-10-12"), f("OXI6", 5, null, null), f("VIEJO", -3, null, null)];
  const comp = compararConValery(
    filas.map((x) => ({ codigo: x.codigo, existencia: x.valery })),
    [{ codigo: "2702PD-500", existencia: 663 }, { codigo: "8004202", existencia: 130 }, { codigo: "OXI6", existencia: 5 }, { codigo: "NUEVO", existencia: 7, nombre: "SOLO EN VALERY" }],
    new Map(), [{ codigo: "8004202", cantidad: -98 }],
  );
  const fs = prepararMaster(filas, HOY, comp);
  const r = resumirMaster(fs);
  assert.equal(r.conValery, true);
  assert.deepEqual([r.distintas, r.porConteo], [4, 1]);   // 2702PD-500, 8004202 (por conteo), VIEJO (no está en Valery), NUEVO
  assert.deepEqual(filasDe(fs, "valery").map((x) => [x.codigo, x.difValery, x.porConteo]),
    [["2702PD-500", 356, false], ["NUEVO", -7, false], ["VIEJO", -3, false], ["8004202", -98, true]]);
  const de = (k: string) => fs.find((x) => x.codigo === k)!;
  assert.deepEqual([de("OXI6").enValery, de("OXI6").difValery], [5, 0]);
  // Las columnas de la comparación: lo que movieron los conteos y lo que queda sin explicar.
  assert.deepEqual([de("8004202").conteos, de("8004202").sinExplicar], [-98, 0]);
  assert.deepEqual([de("2702PD-500").conteos, de("2702PD-500").sinExplicar], [0, 356]);
  assert.deepEqual([de("OXI6").conteos, de("OXI6").sinExplicar], [0, 0]);
  assert.equal(de("VIEJO").enValery, null);               // Valery no tiene el código
  assert.equal(de("NUEVO").nombre, "SOLO EN VALERY");
  assert.equal(vistaInicial({ ...r, porContar: 0 }), "valery");
});

test("sin lectura de Valery (o sin permiso) no hay columna de Valery ni diferencias", () => {
  const fs = prepararMaster([f("A", 3, null, null, null), f("B", 9, null, null, null)], HOY);
  const r = resumirMaster(fs);
  assert.equal(r.conValery, false);
  assert.deepEqual([fs[0].conteos, fs[0].sinExplicar], [null, null]);
  assert.equal(r.distintas, 0);
  assert.equal(r.conCosto, false);
  assert.deepEqual(filasDe(fs, "contar").map((x) => x.codigo), ["B", "A"]);   // sin costo, por existencia
});

test("una empresa sin existencia cargada ni conteos se reconoce como vacía", () => {
  assert.equal(resumirMaster(prepararMaster([f("A", 0, null, null), f("B", 0, null, null)], HOY)).vacio, true);
  assert.equal(resumirMaster(prepararMaster([f("A", 0, 2, "2026-10-01")], HOY)).vacio, false);
});
