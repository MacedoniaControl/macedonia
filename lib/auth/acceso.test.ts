// Pruebas de las decisiones de acceso. Sin base de datos ni navegador:
// sesiones fabricadas contra el criterio puro.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decidirAcceso, sesionPuede, rutaDeInicio, primeraClaveVisible, claveAlerta, type Sesion } from "./acceso.ts";
import { plantillaDeRol } from "./permisos.ts";

const sesion = (rol: Sesion["rol"], empresaId: string | null = "sumigases"): Sesion => ({
  id: "u1", nombre: "Prueba", rol, empresaId, permisos: plantillaDeRol(rol),
});

describe("decidirAcceso", () => {
  test("deja pasar al vendedor a sus secciones", () => {
    const d = decidirAcceso(sesion("vendedor"), "/admin/sumigases/quotes");
    assert.equal(d.tipo, "permitir");
  });

  test("frena al vendedor en Gastos", () => {
    const d = decidirAcceso(sesion("vendedor"), "/admin/sumigases/expenses");
    assert.equal(d.tipo, "denegar");
    if (d.tipo !== "denegar") return;
    assert.equal(d.clave, "expenses");
    assert.match(d.destino, /sinpermiso=expenses/);
  });

  test("el destino de la redireccion es una seccion que SI puede ver", () => {
    const u = sesion("vendedor");
    const d = decidirAcceso(u, "/admin/sumigases/expenses");
    if (d.tipo !== "denegar") throw new Error("deberia denegar");
    // El destino no puede ser otra pagina prohibida: seria un bucle.
    const destinoLimpio = d.destino.split("?")[0];
    assert.equal(decidirAcceso(u, destinoLimpio).tipo, "permitir");
  });

  test("el OWNER pasa a todo, incluso con permisos vacios", () => {
    const u: Sesion = { id: "o", nombre: "O", rol: "owner", empresaId: null, permisos: {} };
    for (const r of ["/admin/expenses", "/admin/users", "/admin/sumigases/receivables"]) {
      assert.equal(decidirAcceso(u, r).tipo, "permitir", `el owner deberia entrar a ${r}`);
    }
  });

  test("el tecnico pasa a cilindros e inventario, y a nada mas", () => {
    // Inventario entro a la plantilla porque el conteo fisico vive ahi y lo
    // hace el almacen. Finanzas sigue cerrada.
    const u = sesion("tecnico");
    assert.equal(decidirAcceso(u, "/admin/sumigases/cylinders").tipo, "permitir");
    assert.equal(decidirAcceso(u, "/admin/sumigases/inventory").tipo, "permitir");
    assert.equal(decidirAcceso(u, "/admin/sumigases/expenses").tipo, "denegar");
    assert.equal(decidirAcceso(u, "/admin/sumigases/reports").tipo, "denegar");
  });

  test("el admin no entra a usuarios", () => {
    const u = sesion("admin");
    assert.equal(decidirAcceso(u, "/admin/sumigases/expenses").tipo, "permitir");
    assert.equal(decidirAcceso(u, "/admin/sumigases/users").tipo, "denegar");
  });

  test("fuera del panel no decide nada", () => {
    assert.equal(decidirAcceso(sesion("vendedor"), "/login").tipo, "fuera-del-panel");
    assert.equal(decidirAcceso(sesion("vendedor"), "/").tipo, "fuera-del-panel");
  });

  test("las sub-rutas heredan el permiso de su seccion", () => {
    const u = sesion("vendedor");
    assert.equal(decidirAcceso(u, "/admin/sumigases/inventory/movimientos").tipo, "permitir");
  });
});

describe("rutaDeInicio", () => {
  test("respeta la empresa de la persona", () => {
    assert.match(rutaDeInicio(sesion("vendedor", "sudematin")), /^\/admin\/sudematin\//);
  });

  test("el tecnico aterriza en cilindros", () => {
    assert.equal(rutaDeInicio(sesion("tecnico")), "/admin/sumigases/cylinders");
  });

  test("sin ninguna seccion, va a sin-acceso en vez de a un bucle", () => {
    const u: Sesion = { id: "x", nombre: "X", rol: "vendedor", empresaId: "sumigases", permisos: {} };
    assert.equal(rutaDeInicio(u), "/sin-acceso");
    assert.equal(primeraClaveVisible(u), null);
  });
});

describe("claveAlerta", () => {
  test("agrupa por persona Y seccion", () => {
    assert.equal(claveAlerta("u1", "expenses"), "acceso-denegado:u1:expenses");
    assert.notEqual(claveAlerta("u1", "expenses"), claveAlerta("u2", "expenses"));
    assert.notEqual(claveAlerta("u1", "expenses"), claveAlerta("u1", "purchases"));
  });
});

describe("sesionPuede", () => {
  test("no se deja engañar por valores que no son true", () => {
    const u = { ...sesion("vendedor"), permisos: { expenses: undefined as unknown as boolean } };
    assert.equal(sesionPuede(u, "expenses"), false);
  });
});
