import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TIPOS_PRECIO, DIVISAS, UNIDADES } from "./catalogos.ts";

// TRES arreglos distintos se aplicaron en un archivo de pantalla y sobrevivieron
// en el otro: la tasa del BCV, el vendedor fijo y los tipos de precio. La causa
// no eran tres descuidos: era que las listas vivían copiadas en cada pantalla.
//
// Esta prueba vigila que no vuelvan a copiarse. No comprueba una función:
// comprueba que el valor tenga UN solo lugar.

const PANTALLAS = [
  "app/admin/delivery-notes/page.tsx",
  "app/admin/quotes/page.tsx",
];

describe("catálogos compartidos", () => {
  test("los tipos de precio son los tres del negocio", () => {
    assert.deepEqual([...TIPOS_PRECIO], ["Precio Mayorista", "Precio Oferta", "Detal"]);
  });

  test("ninguna pantalla redefine las listas por su cuenta", () => {
    for (const arch of PANTALLAS) {
      const txt = fs.readFileSync(arch, "utf8");
      for (const nombre of ["TIPOS_PRECIO", "DIVISAS", "UNIDADES"]) {
        assert.doesNotMatch(
          txt,
          new RegExp(`^const ${nombre}\\s*=`, "m"),
          `${arch} redefine ${nombre}: tiene que importarlo de lib/ux/catalogos`,
        );
      }
    }
  });

  test("no quedó ningún tipo de precio del formato viejo", () => {
    for (const arch of PANTALLAS) {
      const txt = fs.readFileSync(arch, "utf8");
      // "Precio Máximo/Mínimo/Especial" venían de Valery y se reemplazaron.
      assert.doesNotMatch(txt, /"Precio (Máximo|Mínimo|Especial)"/,
        `${arch} conserva un tipo de precio del formato viejo`);
    }
  });

  test("ninguna pantalla trae una tasa de cambio escrita a mano", () => {
    // El caso original: RATE = 49.5 mientras el BCV estaba en 798.
    for (const arch of PANTALLAS) {
      const txt = fs.readFileSync(arch, "utf8");
      assert.doesNotMatch(txt, /\b(RATE|TASA)\s*=\s*\d/,
        `${arch} define una tasa fija: tiene que salir de useTasaViva()`);
    }
  });

  test("las unidades incluyen las que usa el rubro", () => {
    for (const u of ["CILINDRO", "KG", "UNIDAD"]) {
      assert.ok((UNIDADES as readonly string[]).includes(u), `falta la unidad ${u}`);
    }
  });

  test("las dos divisas del negocio", () => {
    assert.deepEqual([...DIVISAS], ["Bolívar", "Dólar"]);
  });
});
