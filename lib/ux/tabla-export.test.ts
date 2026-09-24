import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { nombreArchivo, textoCelda, orientacion, ahoraCaracas, fechaVista } from "./tabla-export.ts";

describe("nombreArchivo", () => {
  test("dice que es, de que empresa y de que dia", () => {
    assert.equal(nombreArchivo({ seccion: "Master" }, "Sumigases", "24-09-2026", "xlsx"), "Inventario Master - Sumigases - 24-09-2026.xlsx");
  });
  test("saca lo que Windows o macOS rechazan", () => {
    assert.equal(nombreArchivo({ seccion: "Conteo 05/SOLDADURA: «x»?" }, "Sudematin", "24-09-2026", "pdf"), "Inventario Conteo 05 SOLDADURA «x» - Sudematin - 24-09-2026.pdf");
  });
});

describe("textoCelda", () => {
  test("vacio es un guion, no un cero", () => {
    assert.equal(textoCelda(null, "num"), "—");
    assert.equal(textoCelda("", "texto"), "—");
  });
  test("numeros como en Venezuela", () => {
    assert.equal(textoCelda(1234.5, "num"), "1.234,5");
    assert.equal(textoCelda(-3, "num"), "−3");
  });
  test("la diferencia lleva el signo siempre", () => {
    assert.equal(textoCelda(4, "dif"), "+4");
    assert.equal(textoCelda(-2.5, "dif"), "−2,5");
    assert.equal(textoCelda(0, "dif"), "0");
  });
  test("dolares y porcentajes", () => {
    assert.equal(textoCelda(1500, "usd"), "$1.500,00");
    assert.equal(textoCelda(-2.5, "usd"), "−$2,50");
    assert.equal(textoCelda(23.456, "pct"), "23,5 %");
  });
  test("una fecha de la base se lee al derecho", () => {
    assert.equal(textoCelda("2026-09-23", "fecha"), "23-09-2026");
    assert.equal(fechaVista("2026-09-23"), "23-09-2026");
    assert.equal(fechaVista(null), null);
  });
});

test("mas de cinco columnas va apaisado", () => {
  const cols = (n: number) => ({ columnas: Array.from({ length: n }, () => ({ titulo: "x" })) });
  assert.equal(orientacion(cols(5)), "portrait");
  assert.equal(orientacion(cols(6)), "landscape");
});

test("la hora es la de Caracas", () => {
  // 03:30 UTC es 23:30 del dia anterior en Caracas (UTC-4).
  assert.deepEqual(ahoraCaracas(new Date("2026-09-24T03:30:00Z")), { fecha: "23-09-2026", fechaHora: "23-09-2026 23:30" });
});
