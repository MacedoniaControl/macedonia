import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hojasXls, leerXls } from "../ux/xls.ts";
import { errorDeValery, esValery, leerValery, mismaContraparte, numeroDocumento, reporteValery, separarDuplicadas, type HojaLeida } from "./valery-cuentas.ts";

// Archivos de prueba con la estructura de los reportes de Valery y datos inventados.
const hojas = (n: string): HojaLeida[] => {
  const b = readFileSync(new URL(`../ux/__fixtures__/${n}`, import.meta.url));
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return hojasXls(buf).map((nombre, i) => ({ nombre, filas: leerXls(buf, i) }));
};

test("reconoce cada reporte por su cabecera", () => {
  assert.equal(reporteValery(hojas("valery-por-cobrar.xls")[0].filas[0]), "cobrar");
  assert.deepEqual(hojas("valery-por-pagar.xls").map((h) => reporteValery(h.filas[0])), ["pagar", "pagar"]);
  assert.equal(reporteValery(["Cliente", "Documento", "Monto USD"]), null);
  assert.equal(esValery(hojas("ventas-completo.xls")), false);
});

test("el reporte de la otra cartera se rechaza y dice dónde va", () => {
  assert.match(errorDeValery("cobrar", hojas("valery-por-pagar.xls")) ?? "", /va en Cuentas por Pagar/);
  assert.match(errorDeValery("pagar", hojas("valery-por-cobrar.xls")) ?? "", /va en Cuentas por Cobrar/);
  assert.equal(errorDeValery("cobrar", hojas("valery-por-cobrar.xls")), null);
});

test("por cobrar: el cliente sale de su fila de grupo, el monto del saldo inicial (no del acumulado)", () => {
  const l = leerValery("cobrar", hojas("valery-por-cobrar.xls"));
  assert.deepEqual(l.filas.map((f) => [f.contraparte, f.documento, f.emitida, f.vence, f.monto]), [
    ["CLIENTE DE PRUEBA UNO, C.A.", "NE-0000017809", "2026-03-02", "2026-04-02", 153.97],
    ["CLIENTE DE PRUEBA UNO, C.A.", "NE-0000018142", "2026-04-10", "2026-05-10", 21.78],
    ["CLIENTE ÑANDÚ, C.A", "NE-S/N 31-12-2024", "2024-12-31", "2025-01-30", 4004.14],
  ]);
  assert.equal(l.enCero, 1);                       // la nota en 0 ya se cobró
  assert.equal(l.sinVencimiento, 3);               // Valery no trae vencimiento: vence el día de emisión
  assert.equal(l.sinNumero, 1);                    // saldo viejo sin número
  assert.equal(l.filas[0].clase, "nota_entrega");
  assert.deepEqual(l.problemas, []);
});

test("por pagar: las dos variantes de columnas; el monto es el saldo, ya sin retención ni abonos", () => {
  const l = leerValery("pagar", hojas("valery-por-pagar.xls"));
  assert.deepEqual(l.filas.map((f) => [f.contraparte, f.documento, f.vence, f.monto]), [
    ["PROVEEDOR NOTAS", "NDE-0000-2379", "2026-08-13", 195],
    ["FERREX", "FCM-206557", "2026-08-17", 373.465],
    ["CODINTER", "FCM-16200", "2026-08-17", 1929.84],
    ["STARGAS", "FCM-80165", "2026-08-17", 378.57],   // la cabecera sin los dos puntos también se lee
  ]);
  assert.match(l.filas[2].nota, /total 3\.881,36 · IVA retenido 401,52 · abonado 1\.550,00/);
  assert.equal(l.filas[0].clase, "nota_entrega");
  assert.equal(l.filas[1].clase, "factura");
});

test("el número de documento se compara sin tipo, ceros ni signos", () => {
  assert.equal(numeroDocumento("NE-0000017809"), "17809");
  assert.equal(numeroDocumento("FCM-206557"), numeroDocumento("206557.0"));
  assert.equal(numeroDocumento("NE 0000012345"), "12345");
});

test("la misma contraparte aunque esté abreviada", () => {
  assert.equal(mismaContraparte("FERREX", "FERREX, C.A."), true);
  assert.equal(mismaContraparte("STARGAS", "STAR GAS C,A"), true);
  assert.equal(mismaContraparte("Gran Cacique II, C.A", "GRAN CACIQUE II C.A."), true);
  assert.equal(mismaContraparte("OXIORIENTE", "STAR GAS C,A"), false);
  assert.equal(mismaContraparte("ABC", "ABCDEF"), false);   // tres letras no alcanzan para decir que es la misma
});

test("duplicadas: las que ya están en la cartera y las repetidas en el archivo, cada una con su cuenta", () => {
  const l = leerValery("pagar", hojas("valery-por-pagar.xls"));
  const cartera = [{ contraparte: "FERREX, C.A.", documento: "FCM-206557", monto: 373.47, saldo: 100, emitida: "2026-07-31" }];
  const repetida = { ...l.filas[2], linea: 99 };
  const s = separarDuplicadas([...l.filas, repetida], cartera);
  assert.deepEqual(s.duplicadas.map((d) => [d.fila.documento, d.existente.contraparte, d.existente.saldo]), [["FCM-206557", "FERREX, C.A.", 100]]);
  assert.deepEqual(s.enArchivo.map((d) => d.fila.documento), ["FCM-16200"]);
  assert.equal(s.nuevas.length, 3);
  // Mismo número de otro proveedor: no es duplicada.
  assert.equal(separarDuplicadas(l.filas, [{ ...cartera[0], contraparte: "OXIORIENTE" }]).duplicadas.length, 0);
});

test("un pedazo del reporte copiado a un libro nuevo, sin cabecera ni «-», también se lee", () => {
  // Así llega cuando se copian a mano unas filas del Estado de Cuenta (al
  // pegarse, la celda combinada del cliente se repite en toda la fila).
  const cliente = Array(10).fill("Descripción Cliente  FERRETERÍA EL CLAVO");
  const h: HojaLeida = { nombre: "Hoja1", filas: [
    ["", ...cliente],
    ["", "NE", "9068", "46293", "46323", "", "", "", "20", "", "20"],
    ["", "NE", "9138", "46297", "45963", "", "", "", "35,5", "", "55,5"],
    ["", "", "", "", "", "", "", "", ",", "0", "55,5"],
  ] };
  assert.equal(esValery([h]), true);
  assert.equal(errorDeValery("cobrar", [h]), null);
  const l = leerValery("cobrar", [h]);
  assert.deepEqual(l.problemas, []);
  assert.deepEqual(l.filas.map((f) => [f.contraparte, f.documento, f.emitida, f.vence, f.monto, f.linea]), [
    ["FERRETERÍA EL CLAVO", "NE-9068", "2026-09-28", "2026-10-28", 20, 2],
    // Vencimiento anterior a la emisión: como nota de entrega, a los 30 días.
    ["FERRETERÍA EL CLAVO", "NE-9138", "2026-10-02", "2026-11-02", 35.5, 3],
  ]);
});

test("sin cabecera, un archivo cualquiera no se toma por reporte de Valery", () => {
  assert.equal(esValery([{ nombre: "x", filas: [["", "Descripción Cliente : A"], ["", "hola", "", "no es fecha"]] }]), false);
  assert.equal(esValery([{ nombre: "x", filas: [["Cliente", "Documento"], ["A", "NE-1"]] }]), false);
});

test("la cabecera también se encuentra con títulos encima", () => {
  const cab = ["Tipo Doc.", "", "Documento", "Fecha Emisión", "Fecha Venc.", "Concepto", "Saldo Inicial", "Anticipo", "Débito", "Crédito", "Saldo"];
  const h: HojaLeida = { nombre: "R", filas: [["Estado de Cuenta de Clientes"], [], cab, ["-", "Descripción Cliente : A"], ["", "NE", "1", "46293", "", "", "10", "", "", "", "10"]] };
  const l = leerValery("cobrar", [h]);
  assert.deepEqual(l.filas.map((f) => [f.contraparte, f.documento, f.monto, f.linea]), [["A", "NE-1", 10, 5]]);
});

test("una fecha que no existe no pasa; el vencimiento «31/9» queda a fin de septiembre", async () => {
  const { aFechaPlantilla, fechaFinDeMes } = await import("./plantilla-cuentas.ts");
  assert.equal(aFechaPlantilla("31/9/2026"), null, "septiembre tiene 30 días");
  assert.equal(aFechaPlantilla("30/2/2026"), null);
  assert.equal(aFechaPlantilla("31/8/2026"), "2026-08-31");
  assert.deepEqual(fechaFinDeMes("31/9/2026"), { fecha: "2026-09-30", corregida: true });
  assert.deepEqual(fechaFinDeMes("30/2/2028"), { fecha: "2028-02-29", corregida: true });
  assert.deepEqual(fechaFinDeMes("12/10/2026"), { fecha: "2026-10-12", corregida: false });
  assert.equal(fechaFinDeMes("45/9/2026").fecha, null);
  const h: HojaLeida = { nombre: "Hoja1", filas: [
    ["", "Descripción Cliente ISMESOL"],
    ["", "NE", "8791", "31/8/2026", "31/9/2026", "", "", "", "1300", "", "1300"],
  ] };
  const f = leerValery("cobrar", [h]).filas[0];
  assert.equal(f.vence, "2026-09-30");
  assert.match(f.nota ?? "", /no existe: fin de mes/);
});

test("la misma nota escrita «NE-8432·ISMESOL» o «NE-8432» es duplicada", () => {
  assert.equal(numeroDocumento("NE-8432·ISMESOL"), numeroDocumento("NE-8432"));
  const s = separarDuplicadas(
    [{ contraparte: "ISMESOL", documento: "NE-8432", emitida: "2026-07-28", vence: "2026-08-28", monto: 100, nota: "" }],
    [{ id: 1, contraparte: "ISMESOL", documento: "NE-8432·ISMESOL", monto: 100, saldo: 100 } as never],
  );
  assert.equal(s.nuevas.length, 0);
  assert.equal(s.duplicadas.length, 1);
});

test("por cobrar: la nota de entrega sin vencimiento en Valery vence el mismo día del mes siguiente", () => {
  const h: HojaLeida = { nombre: "R", filas: [["", "Descripción Cliente A"], ["", "NE", "1", "2026-10-07", "", "", "10", "", "", "", "10"]] };
  assert.equal(leerValery("cobrar", [h]).filas[0].vence, "2026-11-07");
});

test("la nota de entrega vence por la regla, traiga Valery la fecha que traiga", () => {
  const h: HojaLeida = { nombre: "R", filas: [["", "Descripción Cliente A"], ["", "NE", "1", "2026-10-07", "2026-10-07", "", "10", "", "", "", "10"]] };
  assert.equal(leerValery("cobrar", [h]).filas[0].vence, "2026-11-07");
  const h2: HojaLeida = { nombre: "R", filas: [["", "Descripción Cliente A"], ["", "NE", "2", "2026-10-07", "2026-10-20", "", "10", "", "", "", "10"]] };
  assert.equal(leerValery("cobrar", [h2]).filas[0].vence, "2026-11-07");
  // Un 31: 30 días exactos.
  const h3: HojaLeida = { nombre: "R", filas: [["", "Descripción Cliente A"], ["", "NE", "3", "2026-07-31", "2026-08-31", "", "10", "", "", "", "10"]] };
  assert.equal(leerValery("cobrar", [h3]).filas[0].vence, "2026-08-30");
});
