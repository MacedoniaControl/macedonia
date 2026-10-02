import { test } from "node:test";
import assert from "node:assert/strict";
import { precioSinIva } from "./precio-documento.ts";

test("un artículo de $4,00 que el catálogo guarda en $4,64 entra al renglón en $4,00", () => {
  assert.equal(precioSinIva(4.64, 16), 4);
});

test("redondea a centavos, como Valery", () => {
  assert.equal(precioSinIva(4.3723, 16), 3.77);
  assert.equal(precioSinIva(1.0886, 16), 0.94);
});

test("sigue el IVA de la empresa", () => {
  assert.equal(precioSinIva(1.08, 8), 1);
});

test("sin precio sigue sin precio (el renglón queda en rojo)", () => {
  assert.equal(precioSinIva(0, 16), 0);
  assert.equal(precioSinIva(Number.NaN, 16), 0);
});

// Lo que pidieron: el renglón entra sin IVA y la nota impresa siempre muestra
// la fila del IVA entre la base imponible y el total.
import fs from "node:fs";

test("el editor de renglones convierte el precio del catálogo a sin IVA", () => {
  const ed = fs.readFileSync("components/documentos/EditorRenglones.tsx", "utf8");
  assert.match(ed, /const precio = precioSinIva\(p\.precio, ivaPct\)/);
  assert.doesNotMatch(ed, /precio: p\.precio,/);
});

test("la nota de entrega impresa trae la fila de IVA aunque no se aplique", () => {
  const t = fs.readFileSync("lib/ux/doc-templates.ts", "utf8");
  assert.match(t, /BASE IMPONIBLE[\s\S]{0,200}<tr><td class="k">IVA\$\{d\.llevaIva[\s\S]{0,200}TOTAL OPERACIÓN/);
});
