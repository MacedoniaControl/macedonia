import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TIPOS_PRECIO, DIVISAS, UNIDADES, MOTIVOS_ENTRADA, MOTIVOS_SALIDA } from "./catalogos.ts";

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

// El kardex vivio en el navegador (lib/ux/inventory-movements). Ya vive en
// Postgres, pero el modulo viejo siguio ahi meses: seguia exportando su propio
// `Direccion`, y el panel importaba ESE, no el de la base. Es el mismo patron
// que causo los tres arreglos perdidos de arriba, con un agravante: el tipo
// duplicado compilaba igual, asi que nada avisaba.
describe("el kardex vive en la base, no en el navegador", () => {
  const panel = fs.readFileSync("app/admin/inventory/MovimientosPanel.tsx", "utf8");

  test("los motivos salen del catálogo compartido", () => {
    assert.deepEqual([...MOTIVOS_ENTRADA][0], "Ingreso manual por compra");
    assert.deepEqual([...MOTIVOS_SALIDA][0], "Salida manual por venta");
    assert.match(panel, /MOTIVOS_ENTRADA[\s\S]*from "@\/lib\/ux\/catalogos"/);
  });

  test("el panel de movimientos no guarda nada en el navegador", () => {
    assert.doesNotMatch(panel, /localStorage/);
  });

  test("`Direccion` tiene una sola definición, y es la de la base", () => {
    const definiciones = ["lib/inventory", "lib/ux", "lib/cilindros"]
      .flatMap((dir) =>
        fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
          .map((f) => `${dir}/${f}`),
      )
      .filter((ruta) => /^export type Direccion\b/m.test(fs.readFileSync(ruta, "utf8")));
    assert.deepEqual(definiciones, ["lib/inventory/movimientos-db.ts"]);
  });

  test("el panel toma `Direccion` de la base", () => {
    assert.match(panel, /type Direccion[\s\S]*?from "@\/lib\/inventory\/movimientos-db"/);
  });
})

// El navegador dibuja en tres etapas: layout -> pintado -> composicion.
// `transform` y `opacity` se resuelven en la ultima; `box-shadow`, `width` o
// `top` obligan a rehacer las anteriores en CADA cuadro. Esta prueba vigila que
// las utilidades de movimiento no vuelvan a las caras.
describe("el movimiento se queda en composición", () => {
  const css = fs.readFileSync("app/globals.css", "utf8");
  const bloque = (sel: string) => {
    const i = css.indexOf(sel + " {");
    return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
  };

  test("la tarjeta no anima la sombra: la sombra vive en el pseudo-elemento", () => {
    assert.doesNotMatch(bloque(".sumi-realce"), /transition:[^;]*box-shadow/);
    assert.match(bloque(".sumi-realce"), /transition:[^;]*transform/);
    assert.match(bloque(".sumi-realce::after"), /box-shadow/);
    assert.match(bloque(".sumi-realce::after"), /transition:\s*opacity/);
  });

  test("ninguna utilidad anima propiedades que recalculan el layout", () => {
    for (const sel of [".sumi-realce", ".sumi-realce::after", ".sumi-campo"]) {
      assert.doesNotMatch(
        bloque(sel),
        /transition:[^;]*\b(width|height|top|left|right|bottom|margin|padding)\b/,
        `${sel} anima una propiedad de layout`,
      );
    }
  });

  test("el anillo de foco sigue existiendo, solo perdió la transición", () => {
    // Un <input> no admite pseudo-elementos, asi que el anillo tiene que
    // seguir siendo box-shadow. Lo que se quito es animarlo.
    assert.match(css, /\.sumi-campo:focus[\s\S]{0,200}box-shadow:\s*0 0 0 3px/);
    assert.doesNotMatch(bloque(".sumi-campo"), /transition:[^;]*box-shadow/);
  });

  test("todo lo que se mueve respeta prefers-reduced-motion", () => {
    const bloques = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? [];
    const texto = bloques.join("");
    for (const clase of ["sumi-realce", "sumi-entra", "sumi-barra"]) {
      assert.ok(texto.includes(clase), `${clase} no está cubierta`);
    }
  });
});
