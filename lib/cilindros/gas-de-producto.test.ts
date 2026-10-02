import { test } from "node:test";
import assert from "node:assert/strict";
import { gasDeProducto, llenosDeRenglones } from "./gas-de-producto.ts";

const SUMIGASES = ["ACETILENO 2K", "ACETILENO 4K", "ACETILENO 6K", "ARGOMIX", "ARGON", "CO2", "NITROGENO", "OXIGENO", "UAP"];
const SUDEMATIN = ["ACETILENO", "ARGON", "NITROGENO", "OXIGENO"];
const g = (descripcion: string, unidad: string | null = "CILINDRO", gases = SUMIGASES) => gasDeProducto({ descripcion, unidad }, gases);

test("los gases del catálogo de Sumigases van a su gas del parque", () => {
  assert.equal(g("OXIGENO GASEOSO"), "OXIGENO");
  assert.equal(g("ARGON CIL 6 M3"), "ARGON");
  assert.equal(g("ARGON UAP 6M"), "UAP");
  assert.equal(g("ARGOMIX CIL 6 M3"), "ARGOMIX");
  assert.equal(g("NITROGENO GASEOSO CIL 6 M3"), "NITROGENO");
  assert.equal(g("NITROGENO GASEOSO T 110"), "NITROGENO");
  assert.equal(g("CO2 CIL ESTANDAR 25KG"), "CO2");
  assert.equal(g("ACETILENO 2KG"), "ACETILENO 2K");
  assert.equal(g("ACETILENO 4KG"), "ACETILENO 4K");
  assert.equal(g("Acetileno 6 kg"), "ACETILENO 6K");
});

test("accesorios, cascos y lo que no va en cilindro no mueven el parque", () => {
  assert.equal(g("REGULADOR D/OXIGENO 350 T/VICTOR WT", "UND"), null);
  assert.equal(g("PICO CORTE ACETILENO #3 VICTOR", "UND"), null);
  assert.equal(g("CILINDRO DE OXIGENO"), null);
  assert.equal(g("NITROGENO LIQUIDO", "LITRO"), null);
  assert.equal(g("NITROGENO LIQUIDO", null), null);
  assert.equal(g("OXIGENO T110", "UND"), null, "por m³, no por cilindro");
  assert.equal(g("MECHA HSS P/ METAL 1/4\"", "UND"), null);
});

test("en Sudematin el acetileno es uno solo y un gas que no tiene no se inventa", () => {
  assert.equal(g("ACETILENO 2KG", null, SUDEMATIN), "ACETILENO");
  assert.equal(g("ARGOMIX CIL 6 M3", null, SUDEMATIN), null);
  assert.equal(g("ARGON UAP 6M", null, SUDEMATIN), "ARGON");
  assert.equal(g("OXIGENO INDUSTRIAL", "UNIDAD", SUDEMATIN), "OXIGENO", "sin unidad en el catálogo, el editor pone UNIDAD");
});

test("los llenos de la nota suman los renglones de cada gas", () => {
  const r = llenosDeRenglones([
    { descripcion: "OXIGENO GASEOSO", unidad: "CILINDRO", cantidad: 2 },
    { descripcion: "OXIGENO GASEOSO", unidad: "CILINDRO", cantidad: 1 },
    { descripcion: "ACETILENO 2KG", unidad: "CILINDRO", cantidad: 1 },
    { descripcion: "MECHA HSS", unidad: "UND", cantidad: 3 },
    { descripcion: "ARGON CIL 6 M3", unidad: "CILINDRO", cantidad: 0 },
  ], SUMIGASES);
  assert.deepEqual(r, { OXIGENO: 3, "ACETILENO 2K": 1 });
});
