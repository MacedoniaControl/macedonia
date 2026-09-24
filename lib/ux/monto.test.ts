import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseMonto, fmtMonto } from "./monto.ts";
import fs from "node:fs";

// El campo era <input type="number">, que solo entiende el formato del locale
// del navegador y devuelve cadena vacia cuando no lo entiende. Escribiendo como
// se escribe en Venezuela, "1.500" se guardaba como 1,5: sin error, sin aviso,
// y con cara de numero correcto.
describe("parseMonto", () => {
  test("lee el formato venezolano", () => {
    assert.equal(parseMonto("1.500,50"), 1500.5);
    assert.equal(parseMonto("1.234.567,89"), 1234567.89);
    assert.equal(parseMonto("0,5"), 0.5);
  });

  test("lee tambien el formato en ingles: las planillas vienen de las dos formas", () => {
    assert.equal(parseMonto("1,500.50"), 1500.5);
    assert.equal(parseMonto("1500.50"), 1500.5);
  });

  test("un punto con tres digitos es millar, no decimal", () => {
    // Este era el caso que corrompia montos en silencio.
    assert.equal(parseMonto("1.500"), 1500);
    assert.equal(parseMonto("12.000"), 12000);
  });

  test("un punto con uno o dos digitos si es decimal", () => {
    assert.equal(parseMonto("1.5"), 1.5);
    assert.equal(parseMonto("1.50"), 1.5);
    assert.equal(parseMonto("0.99"), 0.99);
  });

  test("la coma manda como decimal: aqui se escribe asi", () => {
    // "1,500" es uno con medio, no mil quinientos. Es ambiguo contra una
    // planilla en ingles, y por eso la pantalla devuelve el monto formateado:
    // quien lo escribio lo ve y lo corrige antes de guardar.
    assert.equal(parseMonto("1,500"), 1.5);
    assert.equal(parseMonto("1,500.50"), 1500.5);  // con punto detras, ya no hay duda
  });

  test("rechaza lo que no es un numero aunque lo parezca", () => {
    assert.equal(parseMonto("1.500.5"), null);   // millares mal formados
    assert.equal(parseMonto("1,2,3"), null);     // tres cosas, no un numero
  });

  test("sin separadores se lee entero", () => {
    assert.equal(parseMonto("1500"), 1500);
    assert.equal(parseMonto("0"), 0);
  });

  test("lo que no se entiende devuelve null, no cero", () => {
    // Devolver 0 es lo que hacia el control viejo: un dato inventado que
    // parece una respuesta.
    for (const malo of ["", "   ", "abc", "12abc", "$100", "1..2,3"]) {
      assert.equal(parseMonto(malo), null, `"${malo}" deberia ser null`);
    }
  });

  test("ignora espacios, incluido el que no se ve", () => {
    assert.equal(parseMonto("  1.500,50  "), 1500.5);
    assert.equal(parseMonto("1 500"), 1500);   // espacio duro, se pega al copiar
  });

  test("acepta negativos: una nota de credito resta", () => {
    assert.equal(parseMonto("-250,75"), -250.75);
  });
});

describe("fmtMonto", () => {
  test("devuelve el monto como se escribe aquí, para poder comprobarlo", () => {
    assert.equal(fmtMonto(1500.5), "1.500,50");
    assert.equal(fmtMonto(0), "0,00");
  });
});

// El defecto no era del parser sino del control: <input type="number">. Esta
// prueba fija el avance, para que las pantallas ya convertidas no vuelvan.
describe("las pantallas de dinero no usan el control nativo", () => {
  const yaConvertidas = [
    "app/admin/payables/page.tsx",
    "app/admin/receivables/page.tsx",
    "components/finanzas/FormularioCuenta.tsx",
    "app/admin/expenses/page.tsx",
    "app/admin/cylinders/PanelGases.tsx",
    "app/admin/quotes/page.tsx",
    "app/admin/delivery-notes/page.tsx",
    "app/admin/purchases/page.tsx",
    "app/admin/products/page.tsx",
  ];

  test("ningún campo de dinero vuelve a type=number", () => {
    for (const f of yaConvertidas) {
      const src = fs.readFileSync(f, "utf8");
      const sospechosos = (src.match(/type="number"[^/>]*/g) ?? []).filter((t) =>
        /monto|precio|costo|tasa|deposito|abono/i.test(t),
      );
      assert.deepEqual(sospechosos, [], `${f} volvió a usar type="number" para dinero`);
    }
  });
});

// Escribir "1.500" pasa por estados intermedios: "1", "1.", "1.5", "1.50".
// Si alguno se interpretara mal, el campo saltaria solo mientras se teclea.
describe("escribir progresivamente no rompe el numero", () => {
  test('teclear "1.500,50" da valores sensatos en cada paso', () => {
    const pasos: [string, number | null][] = [
      ["1", 1],
      ["1.", 1],            // punto suelto: todavia vale uno
      ["1.5", 1.5],
      ["1.50", 1.5],
      ["1.500", 1500],      // el tercer digito lo vuelve millar
      ["1.500,", 1500],
      ["1.500,5", 1500.5],
      ["1.500,50", 1500.5],
    ];
    for (const [txt, esperado] of pasos) {
      assert.equal(parseMonto(txt), esperado, `"${txt}"`);
    }
  });

  test("un cero a la izquierda no arruina el monto", () => {
    assert.equal(parseMonto("0250"), 250);
    assert.equal(parseMonto("0,50"), 0.5);
  });
});
