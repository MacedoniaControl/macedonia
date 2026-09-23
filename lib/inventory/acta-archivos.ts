// Los archivos del acta: Excel y PDF, comun y valorizada.
//
// Mismo diseño que las actas de ejemplo que aprobo el owner (CF-2026-000001).
// Todo sale de un Acta ya armada (lib/inventory/acta.ts): este modulo solo
// dibuja, no calcula, asi que el Excel, el PDF y la pantalla no pueden decir
// cosas distintas.
//
// Solo corre en el servidor: pdfmake y exceljs no van al navegador.

import ExcelJS from "exceljs";
import { SUMIGASES_LOGO } from "../ux/sumigases-logo.ts";
import { SUDEMATIN_LOGO } from "../ux/sudematin-logo.ts";
import { fmtDif, fmtNum, fmtUsdSigno, type Acta, type ActaValorizada } from "./acta.ts";

const C = {
  marron: "#b04e15", navy: "#0b2545", tinta: "#0f1b2d", gris: "#5b6b82", linea: "#d9e0ea",
  fondo: "#f4f6fa", rojo: "#ce2323", azul: "#2461e7", ambar: "#a25903",
  fondoRojo: "#fdf1f1", fondoAzul: "#eff4fe", fondoAmbar: "#fbf3e9",
};

function logoDe(empresa: string): { src: string; ancho: number; alto: number } {
  // Sumigases es horizontal (600x104); Sudematin, cuadrado.
  return /sudematin/i.test(empresa)
    ? { src: SUDEMATIN_LOGO, ancho: 52, alto: 52 }
    : { src: SUMIGASES_LOGO, ancho: 130, alto: 130 * 104 / 600 };
}

const colorDif = (d: number | null) => (d === null ? C.marron : d < 0 ? C.rojo : d > 0 ? C.azul : C.gris);

// =========================================================================== PDF
type PdfMake = {
  virtualfs: { writeFileSync: (n: string, b: Buffer) => void; existsSync: (n: string) => boolean };
  setFonts: (f: object) => void;
  setUrlAccessPolicy: (f: (u: string) => boolean) => void;
  setLocalAccessPolicy: (f: (p: string) => boolean) => void;
  createPdf: (def: object) => { getBuffer: () => Promise<Buffer> };
};

let pdfmake: PdfMake | null = null;
async function motorPdf(): Promise<PdfMake> {
  if (pdfmake) return pdfmake;
  const pm = (await import("pdfmake")).default as unknown as PdfMake;
  const vfs = (await import("pdfmake/build/vfs_fonts.js")).default as unknown as Record<string, string>;
  for (const [nombre, b64] of Object.entries(vfs)) {
    if (!pm.virtualfs.existsSync(nombre)) pm.virtualfs.writeFileSync(nombre, Buffer.from(b64, "base64"));
  }
  pm.setFonts({ Roboto: { normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf", italics: "Roboto-Italic.ttf", bolditalics: "Roboto-MediumItalic.ttf" } });
  // El logo va embebido: el acta no tiene por que tocar internet ni el disco.
  pm.setUrlAccessPolicy(() => false);
  pm.setLocalAccessPolicy(() => false);
  pdfmake = pm;
  return pm;
}

const lineaFina = { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => C.linea, paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 4, paddingRight: () => 4 };
const caja = { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => C.linea, vLineColor: () => C.linea, paddingTop: () => 6, paddingBottom: () => 7, paddingLeft: () => 7, paddingRight: () => 7 };

function encabezado(a: Acta, titulo: string, sub: string) {
  const logo = logoDe(a.empresa);
  return {
    columns: [
      { image: logo.src, width: logo.ancho, height: logo.alto },
      { stack: [
        { text: titulo, bold: true, fontSize: 13, color: C.navy, alignment: "right" },
        { text: a.numero, bold: true, fontSize: 11, color: C.marron, alignment: "right", margin: [0, 2, 0, 0] },
        { text: sub, fontSize: 7.5, color: C.gris, alignment: "right", margin: [0, 2, 0, 0] },
      ] },
    ],
    margin: [0, 0, 0, 14],
  };
}

function pie(a: Acta, que: string) {
  return (pagina: number, total: number) => ({
    margin: [45, 10, 45, 0],
    columns: [
      { text: `${a.empresa} · ${que} ${a.numero} · Generada por Macedonia el ${a.cerradoEn}`, fontSize: 7, color: C.gris },
      { text: `Página ${pagina} de ${total}`, fontSize: 7, color: C.gris, alignment: "right", width: 70 },
    ],
  });
}

function cifra(valor: string, texto: string, color = C.tinta) {
  return { stack: [{ text: valor, bold: true, fontSize: 15, color }, { text: texto, fontSize: 7, color: C.gris }] };
}

function firmas(izq: string, der: string) {
  const f = (r: string) => ({ stack: [
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 0.6, lineColor: C.linea }] },
    { text: r, bold: true, fontSize: 8, margin: [0, 4, 0, 0] },
    { text: "Nombre, firma y fecha", fontSize: 7, color: C.gris },
  ] });
  return { columns: [f(izq), f(der)], margin: [0, 34, 0, 0], unbreakable: true };
}

function historial(a: Acta) {
  return {
    unbreakable: true,
    stack: [
      { text: "HISTORIAL DEL CONTEO", bold: true, fontSize: 8, color: C.navy, margin: [0, 0, 0, 4] },
      { table: { headerRows: 1, widths: [80, 100, "*"], body: [
        ["Fecha y hora", "Evento", "Detalle"].map((t) => ({ text: t, bold: true, fontSize: 7.5, color: C.gris })),
        ...a.eventos.map((e) => [
          { text: e.en, fontSize: 7.5 }, { text: e.tipo, bold: true, fontSize: 7.5 }, { text: e.detalle, fontSize: 7.5, color: C.gris },
        ]),
      ] }, layout: lineaFina },
    ],
  };
}

export async function actaPdf(a: Acta): Promise<Buffer> {
  const pm = await motorPdf();
  const r = a.resumen;
  const cuerpo = [
    ["N°", "Identificación", "Producto", "Und.", "Sistema", "Contado", "Diferencia", "Observación"].map((t, i) => ({
      text: t, bold: true, fontSize: 7.5, color: "#ffffff", fillColor: C.navy, alignment: i >= 4 && i <= 6 ? "right" : "left" })),
    ...a.lineas.map((l) => {
      const fondo = l.diferencia !== null && l.diferencia < 0 ? C.fondoRojo : l.diferencia !== null && l.diferencia > 0 ? C.fondoAzul : undefined;
      const c = (o: object) => ({ ...o, fillColor: fondo });
      return [
        c({ text: l.renglon ?? "+", color: C.gris }),
        c({ stack: [{ text: l.codigo, fontSize: 7.5, characterSpacing: 0.2 }, { text: l.esNuevo ? "SKU MACEDONIA" : "VALERY", fontSize: 6, color: l.esNuevo ? C.marron : C.gris }] }),
        c({ text: l.nombre }),
        c({ text: l.unidad, color: C.gris }),
        c({ text: fmtNum(l.sistema), alignment: "right", color: C.gris }),
        c({ text: fmtNum(l.contado), alignment: "right", bold: true }),
        c({ text: fmtDif(l.diferencia), alignment: "right", bold: true, color: colorDif(l.diferencia) }),
        c({ text: l.observacion, fontSize: 7.5, color: C.gris }),
      ];
    }),
  ];
  const def = {
    pageSize: "A4", pageMargins: [45, 42, 45, 45],
    info: { title: `Acta de conteo ${a.numero}`, author: "Macedonia" },
    defaultStyle: { font: "Roboto", fontSize: 8.5, color: C.tinta },
    footer: pie(a, "Acta de conteo"),
    content: [
      encabezado(a, "ACTA DE CONTEO FÍSICO", `${a.departamento} · ${a.fecha}`),
      { table: { widths: ["*", "*", "*", "*"], body: [
        ["EMPRESA", "DEPARTAMENTO", "FECHA DEL CONTEO", "CONTÓ"].map((t) => ({ text: t, fontSize: 7, color: C.gris, fillColor: C.fondo })),
        [a.empresa, a.departamento, a.fecha, a.conto].map((t) => ({ text: t, bold: true, fillColor: C.fondo })),
        ["ABIERTO", "CERRADO", "EXISTENCIA DEL SISTEMA", ""].map((t) => ({ text: t, fontSize: 7, color: C.gris, fillColor: C.fondo })),
        [a.abiertoEn, a.cerradoEn, "Tomada al cerrar", ""].map((t) => ({ text: t, bold: true, fillColor: C.fondo })),
      ] }, layout: { ...caja, hLineWidth: (i: number, n: { table: { body: unknown[] } }) => (i === 0 || i === n.table.body.length ? 0.6 : 0) }, margin: [0, 0, 0, 10] },
      { table: { widths: ["*", "*", "*", "*", "*", "*"], body: [[
        cifra(String(r.renglones), "renglones contados"),
        cifra(String(r.coinciden), "coinciden con el sistema"),
        cifra(String(r.faltantes), "con faltante", C.rojo),
        cifra(String(r.sobrantes), "con sobrante", C.azul),
        cifra(String(r.nuevos), r.nuevos === 1 ? "artículo nuevo" : "artículos nuevos", C.marron),
        cifra(String(r.sinContar), "sin contar: no se tocan", C.gris),
      ]] }, layout: caja, margin: [0, 0, 0, 12] },
      { table: { headerRows: 1, widths: [16, 64, "*", 26, 40, 40, 42, 70], body: cuerpo }, layout: lineaFina },
      { table: { widths: ["*"], body: [[{
        text: [{ text: "Este acta no modifica el inventario. ", bold: true },
          `Deja constancia de lo que se contó. Las ${r.faltantes + r.sobrantes} diferencias se ajustan solo cuando un owner o admin las aprueba, y esa aprobación queda en el historial del conteo.` +
          (r.sinContar ? ` Los ${r.sinContar} productos sin contar conservan su existencia.` : "")],
        fontSize: 8, color: C.ambar, fillColor: C.fondoAmbar }]] }, layout: "noBorders", margin: [0, 10, 0, 16] },
      historial(a),
      firmas("Contó", "Revisado por"),
    ],
  };
  return pm.createPdf(def).getBuffer();
}

export async function valorizadaPdf(a: ActaValorizada): Promise<Buffer> {
  const pm = await motorPdf();
  const v = a.valor;
  const cuerpo = [
    ["N°", "Identificación", "Producto", "Und.", "Diferencia", "Costo unit.", "Valor"].map((t, i) => ({
      text: t, bold: true, fontSize: 7.5, color: "#ffffff", fillColor: C.navy, alignment: i >= 4 ? "right" : "left" })),
    ...a.lineas.map((l) => [
      { text: l.renglon ?? "+", color: C.gris },
      { stack: [{ text: l.codigo, fontSize: 7.5 }, { text: l.esNuevo ? "SKU MACEDONIA" : "VALERY", fontSize: 6, color: l.esNuevo ? C.marron : C.gris }] },
      { text: l.nombre }, { text: l.unidad, color: C.gris },
      { text: fmtDif(l.diferencia), alignment: "right", bold: true, color: colorDif(l.diferencia) },
      { text: l.costo == null ? "sin costo" : "$" + l.costo.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), alignment: "right", color: C.gris },
      { text: fmtUsdSigno(l.valor ?? null), alignment: "right", bold: true, color: l.valor == null ? C.marron : l.valor < 0 ? C.rojo : C.azul },
    ]),
    [{ text: "" }, { text: "" }, { text: "Diferencia neta", bold: true }, { text: "" }, { text: "" }, { text: "" },
      { text: fmtUsdSigno(v.neto), alignment: "right", bold: true, color: v.neto < 0 ? C.rojo : C.azul }].map((c) => ({ ...c, fillColor: C.fondo })),
  ];
  const def = {
    pageSize: "A4", pageMargins: [45, 48, 45, 45],
    info: { title: `Acta valorizada ${a.numero}`, author: "Macedonia" },
    defaultStyle: { font: "Roboto", fontSize: 8.5, color: C.tinta },
    // Franja en cada pagina: que nadie la imprima creyendo que es el acta comun.
    background: (_p: number, tam: { width: number }) => ({ stack: [
      { canvas: [{ type: "rect", x: 0, y: 0, w: tam.width, h: 20, color: C.rojo }] },
      { text: "CONFIDENCIAL · INCLUYE COSTOS · SOLO OWNER Y ADMIN", color: "#ffffff", bold: true, fontSize: 8, alignment: "center", absolutePosition: { x: 0, y: 6 } },
    ] }),
    footer: pie(a, "Acta valorizada · Confidencial ·"),
    content: [
      encabezado(a, "ACTA VALORIZADA", `${a.departamento} · ${a.fecha}`),
      { table: { widths: ["*", "*", "*", "*"], body: [[
        cifra(fmtUsdSigno(v.faltantes), `faltantes (${a.lineas.filter((l) => (l.valor ?? 0) < 0).length})`, C.rojo),
        cifra(fmtUsdSigno(v.sobrantes), `sobrantes (${a.lineas.filter((l) => (l.valor ?? 0) > 0).length})`, C.azul),
        cifra(fmtUsdSigno(v.neto), "diferencia neta", v.neto < 0 ? C.rojo : C.azul),
        cifra(String(v.sinCosto), "sin costo: no entran en el total", C.marron),
      ]] }, layout: caja, margin: [0, 0, 0, 6] },
      { text: "Costo unitario sin IVA al momento del cierre. Queda fijo en esta acta aunque el costo cambie después. Solo se listan los renglones con diferencia.", fontSize: 7.5, color: C.gris, margin: [0, 0, 0, 10] },
      { table: { headerRows: 1, widths: [16, 64, "*", 26, 46, 50, 54], body: cuerpo }, layout: lineaFina },
      ...(v.sinCosto ? [{ table: { widths: ["*"], body: [[{ text: `${v.sinCosto} renglón(es) sin costo: artículos nuevos con la ficha incompleta o productos que nunca se compraron. Su valor aparece en el próximo conteo, cuando tengan costo: esta acta no se recalcula.`, fontSize: 8, color: C.ambar, fillColor: C.fondoAmbar }]] }, layout: "noBorders", margin: [0, 10, 0, 0] }] : []),
      firmas("Revisado por (owner o admin)", "Aprobó el ajuste"),
    ],
  };
  return pm.createPdf(def).getBuffer();
}

// =========================================================================== EXCEL
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const fino = { style: "thin" as const, color: { argb: argb(C.linea) } };

function hojaBase(wb: ExcelJS.Workbook, nombre: string, a: Acta, titulo: string, confidencial = false) {
  const ws = wb.addWorksheet(nombre, { views: [{ showGridLines: false }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  let fila = 1;
  if (confidencial) {
    ws.mergeCells("A1:I1");
    const c = ws.getCell("A1");
    c.value = "CONFIDENCIAL · INCLUYE COSTOS · SOLO OWNER Y ADMIN";
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(C.rojo) } };
    c.alignment = { horizontal: "center" };
    fila = 2;
  }
  const logo = logoDe(a.empresa);
  const img = wb.addImage({ base64: logo.src, extension: "png" });
  ws.addImage(img, { tl: { col: 0, row: fila - 1 + 0.2 }, ext: { width: logo.ancho * 1.75, height: logo.alto * 1.75 } });
  ws.getRow(fila).height = 22; ws.getRow(fila + 1).height = 22;
  ws.getCell(fila, 5).value = titulo; ws.getCell(fila, 5).font = { bold: true, size: 14, color: { argb: argb(C.navy) } };
  ws.getCell(fila + 1, 5).value = `${a.numero} · ${a.departamento} · ${a.fecha}`;
  ws.getCell(fila + 1, 5).font = { bold: true, size: 11, color: { argb: argb(C.marron) } };
  return { ws, fila: fila + 3 };
}

function cabecera(ws: ExcelJS.Worksheet, fila: number, titulos: string[], derecha: number[]) {
  titulos.forEach((t, i) => {
    const c = ws.getCell(fila, i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(C.navy) } };
    c.alignment = { horizontal: derecha.includes(i + 1) ? "right" : "left", vertical: "middle" };
  });
  ws.getRow(fila).height = 20;
}

const FMT_NUM = "#,##0.###;-#,##0.###;0";
const FMT_DIF = "+#,##0.###;-#,##0.###;0";
const FMT_USD = '"$"#,##0.00';
const FMT_USD_SIGNO = '+"$"#,##0.00;-"$"#,##0.00;0';

export async function actaExcel(a: Acta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Macedonia"; wb.title = `Acta de conteo ${a.numero}`;
  const { ws, fila: f0 } = hojaBase(wb, "Acta", a, "ACTA DE CONTEO FÍSICO");
  const datos: [string, string][] = [["Empresa", a.empresa], ["Departamento", a.departamento], ["Fecha del conteo", a.fecha],
    ["Contó", a.conto], ["Abierto", a.abiertoEn], ["Cerrado", a.cerradoEn], ["Existencia del sistema", "Tomada al cerrar"]];
  datos.forEach(([k, v], i) => {
    ws.getCell(f0 + i, 1).value = k; ws.getCell(f0 + i, 1).font = { size: 9, color: { argb: argb(C.gris) } };
    ws.getCell(f0 + i, 3).value = v; ws.getCell(f0 + i, 3).font = { bold: true };
  });
  const fc = f0 + datos.length + 1;
  cabecera(ws, fc, ["N°", "Identificación", "Origen", "Producto", "Und.", "Sistema", "Contado", "Diferencia", "Observación"], [6, 7, 8]);
  a.lineas.forEach((l, i) => {
    const r = ws.getRow(fc + 1 + i);
    // La diferencia va como NUMERO, no como formula: el acta no se edita, y
    // una formula se ve vacia en la vista previa del telefono.
    r.values = [l.renglon ?? "+", l.codigo, l.esNuevo ? "SKU Macedonia" : "Valery", l.nombre, l.unidad,
      l.sistema ?? "nuevo", l.contado, l.diferencia ?? "nuevo", l.observacion];
    r.eachCell((c) => { c.border = { bottom: fino }; });
    r.getCell(2).font = { name: "Consolas" };
    if (l.esNuevo) r.getCell(3).font = { bold: true, color: { argb: argb(C.marron) } };
    [6, 7, 8].forEach((j) => { r.getCell(j).alignment = { horizontal: "right" }; });
    r.getCell(6).numFmt = FMT_NUM; r.getCell(7).numFmt = FMT_NUM; r.getCell(8).numFmt = FMT_DIF;
    if (l.diferencia) {
      r.getCell(8).font = { bold: true, color: { argb: argb(l.diferencia < 0 ? C.rojo : C.azul) } };
      r.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(l.diferencia < 0 ? C.fondoRojo : C.fondoAzul) } };
    }
  });
  const ultima = fc + a.lineas.length;
  ws.autoFilter = { from: { row: fc, column: 1 }, to: { row: ultima, column: 9 } };
  ws.views = [{ state: "frozen", ySplit: fc, showGridLines: false }];
  const r = a.resumen;
  let fr = ultima + 2;
  ws.getCell(fr, 1).value = "Resumen"; ws.getCell(fr, 1).font = { bold: true, size: 11, color: { argb: argb(C.navy) } };
  ([["Renglones contados", r.renglones], ["Coinciden con el sistema", r.coinciden], ["Con faltante", r.faltantes],
    ["Con sobrante", r.sobrantes], ["Artículos nuevos", r.nuevos], ["Sin contar", r.sinContar]] as [string, number][])
    .forEach(([k, v]) => { fr++; ws.getCell(fr, 1).value = k; ws.getCell(fr, 4).value = v; ws.getCell(fr, 4).font = { bold: true }; });
  ws.getCell(fr + 2, 1).value = "Este acta no modifica el inventario. Las diferencias se ajustan solo con la aprobación de un owner o admin.";
  ws.getCell(fr + 2, 1).font = { italic: true, size: 9, color: { argb: argb(C.ambar) } };
  [5, 15, 14, 44, 8, 11, 11, 11, 38].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.headerFooter.oddFooter = `&C${a.numero} · Página &P de &N`;

  const h = wb.addWorksheet("Historial", { views: [{ showGridLines: false }] });
  cabecera(h, 1, ["Fecha y hora", "Evento", "Detalle"], []);
  a.eventos.forEach((e, i) => {
    const row = h.getRow(2 + i);
    row.values = [e.en, e.tipo, e.detalle];
    row.getCell(2).font = { bold: true };
    row.eachCell((c) => { c.border = { bottom: fino }; c.alignment = { vertical: "top", wrapText: true }; });
  });
  [18, 26, 90].forEach((w, i) => { h.getColumn(i + 1).width = w; });

  // Lo que falta contar del departamento: la lista de trabajo del proximo conteo.
  const sc = wb.addWorksheet("Sin contar", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
  sc.getCell(1, 1).value = `Productos que no entraron en este conteo · conservan su existencia`;
  sc.getCell(1, 1).font = { bold: true, color: { argb: argb(C.navy) } };
  cabecera(sc, 3, ["Código", "Producto", "Und.", "Sistema"], [4]);
  a.sinContar.forEach((s, i) => {
    const row = sc.getRow(4 + i);
    row.values = [s.codigo, s.nombre, s.unidad, s.sistema];
    row.getCell(1).font = { name: "Consolas" }; row.getCell(4).numFmt = FMT_NUM;
  });
  if (a.sinContar.length) sc.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + a.sinContar.length, column: 4 } };
  [16, 50, 8, 11].forEach((w, i) => { sc.getColumn(i + 1).width = w; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function valorizadaExcel(a: ActaValorizada): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Macedonia"; wb.title = `Acta valorizada ${a.numero}`;
  const { ws, fila: f0 } = hojaBase(wb, "Valorizada", a, "ACTA VALORIZADA", true);
  const v = a.valor;
  ([["Faltantes", v.faltantes], ["Sobrantes", v.sobrantes], ["Diferencia neta", v.neto]] as [string, number][]).forEach(([k, n], i) => {
    ws.getCell(f0 + i, 1).value = k; ws.getCell(f0 + i, 1).font = { color: { argb: argb(C.gris) } };
    const c = ws.getCell(f0 + i, 3); c.value = n; c.numFmt = FMT_USD_SIGNO; c.font = { bold: true, size: 11, color: { argb: argb(n < 0 ? C.rojo : C.azul) } };
  });
  ws.getCell(f0 + 3, 1).value = "Costo unitario sin IVA al cierre. Queda fijo aunque el costo cambie después.";
  ws.getCell(f0 + 3, 1).font = { italic: true, size: 9, color: { argb: argb(C.gris) } };
  const fc = f0 + 5;
  cabecera(ws, fc, ["N°", "Identificación", "Producto", "Und.", "Diferencia", "Costo unit. $", "Valor $"], [5, 6, 7]);
  a.lineas.forEach((l, i) => {
    const r = ws.getRow(fc + 1 + i);
    r.values = [l.renglon ?? "+", l.codigo, l.nombre, l.unidad, l.diferencia ?? "nuevo", l.costo ?? "sin costo", l.valor ?? null];
    r.eachCell((c) => { c.border = { bottom: fino }; });
    r.getCell(2).font = { name: "Consolas" };
    r.getCell(5).numFmt = FMT_DIF; r.getCell(6).numFmt = FMT_USD; r.getCell(7).numFmt = FMT_USD_SIGNO;
    [5, 6, 7].forEach((j) => { r.getCell(j).alignment = { horizontal: "right" }; });
    if (l.valor != null) r.getCell(7).font = { bold: true, color: { argb: argb(l.valor < 0 ? C.rojo : C.azul) } };
  });
  const t = ws.getRow(fc + 1 + a.lineas.length);
  t.getCell(3).value = "Diferencia neta"; t.getCell(3).font = { bold: true };
  t.getCell(7).value = v.neto; t.getCell(7).numFmt = FMT_USD_SIGNO; t.getCell(7).font = { bold: true, color: { argb: argb(v.neto < 0 ? C.rojo : C.azul) } };
  t.eachCell((c) => { c.border = { top: { style: "medium", color: { argb: argb(C.navy) } } }; });
  [5, 15, 46, 7, 12, 13, 13, 4, 4].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.headerFooter.oddHeader = "&CCONFIDENCIAL · SOLO OWNER Y ADMIN";
  ws.headerFooter.oddFooter = `&C${a.numero} valorizada · Página &P de &N`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
