import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// La pared entre empresas se rompió CUATRO veces. La última fue al eliminar el
// consolidado: el hook caía a "sumigases" y el selector de la cabecera a la
// última opción de su lista, o sea Sudematin. La pantalla leía datos de una
// empresa y mostraba el nombre de la otra.
//
// Esta prueba no ejercita una función: comprueba que dos archivos sigan
// poniéndose de acuerdo. Es justo el error que ninguna prueba de unidad atrapa,
// porque cada mitad por separado está bien.
//
// Se lee el TEXTO y no se importa el módulo a propósito: use-empresa.ts arrastra
// next/navigation, que no existe fuera del navegador.

const hook = fs.readFileSync("lib/ux/use-empresa.ts", "utf8");
const selector = fs.readFileSync("components/ui/CompanySelector.tsx", "utf8");
const nav = fs.readFileSync("lib/ux/nav.ts", "utf8");

describe("pared entre empresas", () => {
  test("el valor de reserva se declara UNA sola vez", () => {
    const m = hook.match(/export const EMPRESA_POR_DEFECTO = "(\w+)"/);
    assert.ok(m, "use-empresa.ts tiene que exportar EMPRESA_POR_DEFECTO");
    assert.ok(["sumigases", "sudematin"].includes(m![1]),
      `el valor de reserva es "${m![1]}", que no es una empresa real`);
  });

  test("el selector importa ese valor en vez de escribir el suyo", () => {
    assert.match(selector, /EMPRESA_POR_DEFECTO/,
      "CompanySelector escribe su propio valor de reserva: ahí es donde se rompe");
  });

  test("nadie cae al consolidado, que ya no existe como opción", () => {
    assert.doesNotMatch(selector, /:\s*"all"/,
      "queda 'all' como reserva y esa opción se eliminó: el find falla y agarra otra empresa");
  });

  test("nadie cae al ÚLTIMO elemento de la lista", () => {
    assert.doesNotMatch(selector, /OPCIONES\[OPCIONES\.length - 1\]/,
      "caer al último hace que la etiqueta dependa del ORDEN de la lista, no de la ruta");
  });

  test("el consolidado no volvió como opción visible", () => {
    // Se vigila la CONDUCTA, no la palabra: los comentarios explican por qué se
    // quitó y nombrarlo ahí es correcto. La primera versión de esta prueba
    // prohibía el término y se marcó a sí misma.
    const sinComentarios = (txt: string) =>
      txt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    assert.doesNotMatch(sinComentarios(nav), /Consolidado/i,
      "volvió una entrada de consolidado al menú");
    assert.doesNotMatch(sinComentarios(selector), /name:\s*"Consolidado"|>\s*Consolidado/i,
      "volvió el consolidado como opción del selector");
  });
});
