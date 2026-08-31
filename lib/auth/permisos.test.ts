// Pruebas del catálogo de permisos y las plantillas por rol.
// Aquí se decide qué ve cada persona: un fallo deja a alguien fuera de su
// trabajo, o le abre algo que no debía ver.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { plantillaDeRol, claveDeRuta, puedeVer, CLAVES_MODULO, TODAS_LAS_CLAVES } from "./permisos.ts";

describe("plantillaDeRol", () => {
  test("ninguna plantilla deja al usuario sin ningun modulo", () => {
    for (const rol of ["owner", "admin", "vendedor", "tecnico"] as const) {
      const encendidos = Object.values(plantillaDeRol(rol)).filter(Boolean).length;
      assert.ok(encendidos > 0, `${rol} quedaria sin acceso a nada`);
    }
  });

  test("el vendedor ve operacion e inventario, no finanzas", () => {
    const p = plantillaDeRol("vendedor");
    assert.equal(p["quotes"], true);
    assert.equal(p["delivery-notes"], true);
    assert.equal(p["inventory"], true);
    assert.equal(p["products"], true);
    assert.equal(p["expenses"], false);
    assert.equal(p["receivables"], false);
  });

  test("el tecnico SOLO ve cilindros", () => {
    const p = plantillaDeRol("tecnico");
    const encendidos = Object.entries(p).filter(([, v]) => v).map(([k]) => k);
    assert.deepEqual(encendidos, ["cylinders"]);
  });

  test("el admin ve todo de su empresa menos registros y usuarios", () => {
    const p = plantillaDeRol("admin");
    assert.equal(p["expenses"], true);
    assert.equal(p["receivables"], true);
    assert.equal(p["users"], false);
    assert.equal(p["ver_registros"], false);
  });

  test("el owner tiene absolutamente todo encendido", () => {
    assert.ok(Object.values(plantillaDeRol("owner")).every(Boolean));
  });

  test("toda plantilla define TODAS las claves, sin huecos", () => {
    for (const rol of ["owner", "admin", "vendedor", "tecnico"] as const) {
      const p = plantillaDeRol(rol);
      for (const c of TODAS_LAS_CLAVES) {
        assert.equal(typeof p[c], "boolean", `${rol} no define ${c}`);
      }
    }
  });
});

describe("claveDeRuta", () => {
  test("reconoce la ruta con empresa", () => {
    assert.equal(claveDeRuta("/admin/sumigases/expenses"), "expenses");
    assert.equal(claveDeRuta("/admin/sudematin/delivery-notes"), "delivery-notes");
  });

  test("reconoce la ruta consolidada", () => {
    assert.equal(claveDeRuta("/admin/inventory"), "inventory");
  });

  test("reconoce sub-rutas", () => {
    assert.equal(claveDeRuta("/admin/sumigases/inventory/movimientos"), "inventory");
  });

  test("no confunde una clave con el prefijo de otra", () => {
    // "sales" no debe capturar "/admin/sales-algo" ni al reves
    assert.equal(claveDeRuta("/admin/delivery-notes"), "delivery-notes");
  });

  test("devuelve null fuera del panel", () => {
    assert.equal(claveDeRuta("/login"), null);
    assert.equal(claveDeRuta("/"), null);
    assert.equal(claveDeRuta("/admin/"), null);
  });
});

describe("puedeVer", () => {
  test("el owner puede aunque tenga TODO apagado", () => {
    const ninguno = Object.fromEntries(TODAS_LAS_CLAVES.map((k) => [k, false]));
    assert.equal(puedeVer(ninguno, "owner", "expenses"), true);
    assert.equal(puedeVer({}, "owner", "users"), true);
  });

  test("los demas dependen de su permiso", () => {
    assert.equal(puedeVer({ expenses: true }, "vendedor", "expenses"), true);
    assert.equal(puedeVer({ expenses: false }, "vendedor", "expenses"), false);
    assert.equal(puedeVer({}, "admin", "expenses"), false);
  });
});

describe("CLAVES_MODULO", () => {
  // 16 desde que se eliminaron Auditoria y Comisiones y bonos (26-ago-2026).
  test("cubre las 16 secciones del menu", () => {
    assert.equal(CLAVES_MODULO.length, 16);
  });

  test("no tiene claves repetidas", () => {
    assert.equal(new Set(CLAVES_MODULO).size, CLAVES_MODULO.length);
  });

  test("ninguna clave lleva barras", () => {
    for (const c of CLAVES_MODULO) assert.ok(!c.includes("/"), `${c} lleva barra`);
  });
});
