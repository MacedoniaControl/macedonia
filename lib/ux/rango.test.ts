import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { claveDe, etiquetaDe, dentroDe, agrupar, RANGO_POR_DEFECTO, type Rango } from "./rango.ts";

describe("claveDe", () => {
  test("agrupa por año", () => {
    assert.equal(claveDe("2026-08-26", "anio"), "2026");
    assert.equal(claveDe("2026-01-01", "anio"), "2026");
  });

  test("agrupa por mes", () => {
    assert.equal(claveDe("2026-08-26", "mes"), "2026-08");
    assert.equal(claveDe("2026-08-01", "mes"), "2026-08");
    assert.notEqual(claveDe("2026-08-31", "mes"), claveDe("2026-09-01", "mes"));
  });

  test("dos dias de la misma semana caen en la misma caja", () => {
    // 2026-08-24 es lunes; 2026-08-26 miercoles de esa misma semana.
    assert.equal(claveDe("2026-08-24", "semana"), claveDe("2026-08-26", "semana"));
  });

  test("el domingo cierra la semana, el lunes abre otra", () => {
    // ISO: la semana va de lunes a domingo.
    assert.notEqual(claveDe("2026-08-23", "semana"), claveDe("2026-08-24", "semana"));
  });

  test("fin de año: el 31-dic puede pertenecer a la semana 1 del año siguiente", () => {
    // Es la razon de usar el jueves como ancla: si no, se parte el año.
    const k = claveDe("2025-12-31", "semana");
    assert.match(k, /^\d{4}-S\d{2}$/);
  });
});

describe("etiquetaDe", () => {
  test("el mes se lee en castellano", () => {
    assert.equal(etiquetaDe("2026-08", "mes"), "ago 2026");
    assert.equal(etiquetaDe("2026-01", "mes"), "ene 2026");
    assert.equal(etiquetaDe("2026-12", "mes"), "dic 2026");
  });
  test("la semana se lee legible", () => {
    assert.equal(etiquetaDe("2026-S35", "semana"), "2026 · sem 35");
  });
});

describe("dentroDe", () => {
  const r: Rango = { desde: "2026-08-01", hasta: "2026-08-31", agrupacion: "mes" };
  test("los bordes entran", () => {
    assert.equal(dentroDe("2026-08-01", r), true);
    assert.equal(dentroDe("2026-08-31", r), true);
  });
  test("un dia afuera queda afuera", () => {
    assert.equal(dentroDe("2026-07-31", r), false);
    assert.equal(dentroDe("2026-09-01", r), false);
  });
});

describe("agrupar", () => {
  const filas = [
    { f: "2026-07-15", v: 10 },
    { f: "2026-08-02", v: 20 },
    { f: "2026-08-20", v: 5 },
    { f: "2026-09-01", v: 99 },   // fuera del rango
  ];
  const r: Rango = { desde: "2026-07-01", hasta: "2026-08-31", agrupacion: "mes" };

  test("descarta lo que cae fuera del rango", () => {
    const g = agrupar(filas, (x) => x.f, r);
    assert.equal(g.flatMap((x) => x.filas).length, 3);
  });

  test("junta el mismo mes en una caja", () => {
    const g = agrupar(filas, (x) => x.f, r);
    const agosto = g.find((x) => x.clave === "2026-08");
    assert.equal(agosto?.filas.length, 2);
  });

  test("devuelve los periodos en orden", () => {
    const g = agrupar(filas, (x) => x.f, r);
    assert.deepEqual(g.map((x) => x.clave), ["2026-07", "2026-08"]);
  });

  test("sin filas no explota", () => {
    assert.deepEqual(agrupar([], (x: { f: string }) => x.f, r), []);
  });
});

describe("RANGO_POR_DEFECTO", () => {
  test("arranca en el mes, que es lo que se mira todos los dias", () => {
    assert.equal(RANGO_POR_DEFECTO.agrupacion, "mes");
  });
  test("desde es anterior a hasta", () => {
    assert.ok(RANGO_POR_DEFECTO.desde < RANGO_POR_DEFECTO.hasta);
  });
});

// --- histórico filtrado por rango ---
import { historicoEnRango, totalesDe } from "./historico-rango.ts";

describe("historicoEnRango", () => {
  const todo: Rango = { desde: "2022-01-01", hasta: "2026-12-31", agrupacion: "mes" };

  test("trae meses reales de la empresa", () => {
    const p = historicoEnRango("sumigases", todo);
    assert.ok(p.length > 30, `esperaba mas de 30 meses, hubo ${p.length}`);
  });

  test("las dos empresas dan numeros distintos", () => {
    const a = totalesDe(historicoEnRango("sumigases", todo));
    const b = totalesDe(historicoEnRango("sudematin", todo));
    assert.notEqual(a.venta, b.venta);
  });

  test("agrupar por año junta los meses de cada año", () => {
    const p = historicoEnRango("sumigases", { ...todo, agrupacion: "anio" });
    assert.ok(p.length <= 5, `esperaba a lo sumo 5 años, hubo ${p.length}`);
    assert.ok(p.every((x) => /^\d{4}$/.test(x.clave)));
  });

  test("el total no cambia al cambiar la agrupacion", () => {
    const porMes = totalesDe(historicoEnRango("sumigases", todo));
    const porAnio = totalesDe(historicoEnRango("sumigases", { ...todo, agrupacion: "anio" }));
    assert.equal(porMes.venta, porAnio.venta);
    assert.equal(porMes.compra, porAnio.compra);
  });

  test("un rango angosto trae menos que uno ancho", () => {
    const ancho = historicoEnRango("sumigases", todo).length;
    const angosto = historicoEnRango("sumigases", { desde: "2026-01-01", hasta: "2026-03-31", agrupacion: "mes" }).length;
    assert.ok(angosto < ancho);
    assert.equal(angosto, 3);
  });

  test("un rango sin datos devuelve vacio, no explota", () => {
    const p = historicoEnRango("sumigases", { desde: "2010-01-01", hasta: "2010-12-31", agrupacion: "mes" });
    assert.deepEqual(p, []);
    assert.equal(totalesDe(p).venta, 0);
  });

  test("pedir semanas cae a meses: el historico es mensual", () => {
    const sem = historicoEnRango("sumigases", { ...todo, agrupacion: "semana" });
    const mes = historicoEnRango("sumigases", todo);
    assert.deepEqual(sem.map((x) => x.clave), mes.map((x) => x.clave));
  });
});

describe("totalesDe", () => {
  test("el margen sale de la utilidad sobre la venta", () => {
    const t = totalesDe([{ clave: "x", etiqueta: "x", venta: 200, costo: 100, util: 50, compra: 100, margen: 0, roi: 0 }]);
    assert.equal(t.margen, 25);
    assert.equal(t.roi, 50);
  });
  test("sin ventas no divide por cero", () => {
    const t = totalesDe([{ clave: "x", etiqueta: "x", venta: 0, costo: 0, util: 0, compra: 0, margen: 0, roi: 0 }]);
    assert.equal(t.margen, 0);
    assert.equal(t.roi, 0);
  });
});
