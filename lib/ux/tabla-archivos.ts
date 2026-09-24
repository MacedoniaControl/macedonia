// Excel y PDF de una tabla del inventario, armados EN EL NAVEGADOR.
//
// Por que aquí y no en el servidor, como las actas: Movimientos tiene ~23.000
// filas, y Vercel corta las peticiones y respuestas de una funcion en ~4,5 MB.
// Los datos ya estan en la pantalla; mandarlos al servidor para que los
// devuelva dibujados era el camino largo y con techo.
//
// exceljs y pdfmake pesan ~3 MB: se cargan recien al pedir un archivo, no con
// la pagina.

import { C, argb, logoDe } from "./estilo-documentos";
import { orientacion, textoCelda, type Columna, type MetaExport, type TablaExport } from "./tabla-export";

// Sumar decimales en coma flotante deja colas (40837,766000000002): se
// redondea a lo que la pantalla muestra.
const redondear = (v: TablaExport["filas"][number][number], c: Columna) =>
  typeof v === "number" ? Math.round(v * (c.tipo === "usd" ? 100 : 1000)) / (c.tipo === "usd" ? 100 : 1000) : v;

const esNumero = (c: Columna) => c.tipo === "num" || c.tipo === "dif" || c.tipo === "usd" || c.tipo === "pct";

const FORMATO: Partial<Record<NonNullable<Columna["tipo"]>, string>> = {
  num: "#,##0.###;[Red]-#,##0.###;0",
  dif: "+#,##0.###;[Red]-#,##0.###;0",
  usd: '"$"#,##0.00;[Red]-"$"#,##0.00',
  pct: '0.0" %";[Red]-0.0" %"',
};

// =========================================================================== Excel

export async function tablaExcel(t: TablaExport, m: MetaExport): Promise<Blob> {
  const mod = await import("exceljs");
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Macedonia";
  wb.title = t.titulo;

  const n = t.columnas.length;
  const CAB = t.detalle.length ? 6 : 5; // fila de los titulos de columna
  const ws = wb.addWorksheet(t.seccion.slice(0, 31), {
    views: [{ showGridLines: false, state: "frozen", ySplit: CAB }],
    pageSetup: { paperSize: 9, orientation: orientacion(t), fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${CAB}:${CAB}` },
  });

  // Encabezado: logo a la izquierda, los datos del documento a la derecha.
  const logo = logoDe(m.empresa);
  ws.addImage(wb.addImage({ base64: logo.src, extension: "png" }), { tl: { col: 0, row: 0.15 }, ext: { width: logo.ancho * 1.4, height: logo.alto * 1.4 } });
  const linea = (fila: number, texto: string, font: Partial<import("exceljs").Font>) => {
    ws.mergeCells(fila, 1, fila, n);
    const c = ws.getCell(fila, 1);
    c.value = texto; c.font = font; c.alignment = { horizontal: "right" };
  };
  linea(1, t.titulo, { bold: true, size: 14, color: { argb: argb(C.navy) } });
  linea(2, `${m.empresa} · RIF ${m.rif}`, { bold: true, size: 10, color: { argb: argb(C.marron) } });
  linea(3, `Generado el ${m.generado} por ${m.por} · ${t.filas.length.toLocaleString("es-VE")} fila(s)`, { size: 9, color: { argb: argb(C.gris) } });
  if (t.detalle.length) linea(4, t.detalle.join(" · "), { size: 9, color: { argb: argb(C.gris) } });
  ws.getRow(1).height = 20;

  const cab = ws.getRow(CAB);
  t.columnas.forEach((col, i) => {
    const c = cab.getCell(i + 1);
    c.value = col.titulo;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(C.navy) } };
    c.alignment = { horizontal: esNumero(col) ? "right" : "left", vertical: "middle" };
  });
  cab.height = 20;

  // Formato por COLUMNA, no por celda: con 23.000 filas es la diferencia
  // entre un segundo y veinte.
  t.columnas.forEach((col, i) => {
    const x = ws.getColumn(i + 1);
    if (FORMATO[col.tipo ?? "texto"]) x.numFmt = FORMATO[col.tipo ?? "texto"]!;
    if (col.tipo === "codigo") x.font = { name: "Consolas", size: 10 };
  });
  t.filas.forEach((fila) => {
    ws.addRow(fila.map((v, i) => (v === null ? null : t.columnas[i].tipo === "fecha" ? textoCelda(v, "fecha") : redondear(v, t.columnas[i]))));
  });

  if (t.totales) {
    const r = ws.addRow(t.totales.map((v, i) => redondear(v, t.columnas[i])));
    r.font = { bold: true };
    r.eachCell((c) => { c.border = { top: { style: "medium", color: { argb: argb(C.navy) } } }; });
  }
  if (t.nota) {
    ws.addRow([]);
    const r = ws.addRow([t.nota]);
    ws.mergeCells(r.number, 1, r.number, n);
    r.getCell(1).font = { italic: true, size: 9, color: { argb: argb(C.gris) } };
    r.getCell(1).alignment = { wrapText: true };
    r.height = 30;
  }

  ws.autoFilter = { from: { row: CAB, column: 1 }, to: { row: CAB, column: n } };
  // Ancho por lo que trae: el titulo o lo mas largo de una muestra.
  const muestra = t.filas.slice(0, 400);
  t.columnas.forEach((col, i) => {
    const largo = Math.max(col.titulo.length, ...muestra.map((f) => textoCelda(f[i], col.tipo).length));
    ws.getColumn(i + 1).width = Math.min(60, Math.max(col.tipo === "codigo" ? 12 : 8, largo + 2));
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// =========================================================================== PDF

type PdfMake = {
  addVirtualFileSystem: (vfs: Record<string, string>) => void;
  addFonts: (f: object) => void;
  createPdf: (def: object) => { getBlob: () => Promise<Blob> };
};
let motor: PdfMake | null = null;

async function motorPdf(): Promise<PdfMake> {
  if (motor) return motor;
  const pm = await import("pdfmake/build/pdfmake");
  const fuentes = await import("pdfmake/build/vfs_fonts");
  const m = (pm.default ?? pm) as PdfMake;
  m.addVirtualFileSystem((fuentes.default ?? fuentes) as Record<string, string>);
  m.addFonts({ Roboto: { normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf", italics: "Roboto-Italic.ttf", bolditalics: "Roboto-MediumItalic.ttf" } });
  motor = m;
  return m;
}

export async function tablaPdf(t: TablaExport, m: MetaExport): Promise<Blob> {
  const pm = await motorPdf();
  const logo = logoDe(m.empresa);
  const apaisado = orientacion(t) === "landscape";

  // La columna de texto mas larga (el nombre del producto) se lleva el ancho
  // que sobra; las demas, lo que necesitan.
  const muestra = t.filas.slice(0, 200);
  const largoMedio = t.columnas.map((col, i) =>
    col.tipo && col.tipo !== "texto" ? 0 : muestra.reduce((a, f) => a + textoCelda(f[i]).length, 0) / Math.max(1, muestra.length));
  const ancha = largoMedio.indexOf(Math.max(...largoMedio));
  const widths = t.columnas.map((_, i) => (i === ancha ? "*" : "auto"));

  const alinear = (col: Columna) => (esNumero(col) ? "right" : "left");
  const celda = (v: TablaExport["filas"][number][number], col: Columna) => {
    const texto = textoCelda(redondear(v, col), col.tipo);
    const negativo = typeof v === "number" && v < 0 && esNumero(col);
    return { text: texto, alignment: alinear(col), color: negativo ? C.rojo : undefined };
  };

  const body = [
    t.columnas.map((col) => ({ text: col.titulo, bold: true, color: "#ffffff", fillColor: C.navy, alignment: alinear(col), noWrap: true })),
    ...t.filas.map((f) => f.map((v, i) => celda(v, t.columnas[i]))),
    ...(t.totales ? [t.totales.map((v, i) => ({ ...celda(v, t.columnas[i]), text: v === null ? "" : textoCelda(redondear(v, t.columnas[i]), t.columnas[i].tipo), bold: true }))] : []),
  ];

  const def = {
    pageSize: "A4",
    pageOrientation: apaisado ? "landscape" : "portrait",
    pageMargins: [36, 40, 36, 44],
    info: { title: t.titulo, author: "Macedonia", subject: m.empresa },
    defaultStyle: { font: "Roboto", fontSize: apaisado ? 7.5 : 8, color: C.tinta },
    content: [
      {
        columns: [
          { image: logo.src, width: logo.ancho, height: logo.alto },
          { stack: [
            { text: t.titulo, bold: true, fontSize: 13, color: C.navy, alignment: "right" },
            { text: `${m.empresa} · RIF ${m.rif}`, bold: true, fontSize: 9, color: C.marron, alignment: "right", margin: [0, 2, 0, 0] },
            { text: `Generado el ${m.generado} por ${m.por} · ${t.filas.length.toLocaleString("es-VE")} fila(s)`, fontSize: 7.5, color: C.gris, alignment: "right", margin: [0, 2, 0, 0] },
          ] },
        ],
        margin: [0, 0, 0, 10],
      },
      ...(t.detalle.length ? [{ text: t.detalle.join(" · "), fontSize: 8, color: C.gris, margin: [0, 0, 0, 8] }] : []),
      {
        table: { headerRows: 1, widths, body },
        layout: {
          hLineWidth: (i: number) => (t.totales && i === body.length - 1 ? 1 : 0.4),
          vLineWidth: () => 0,
          hLineColor: (i: number) => (t.totales && i === body.length - 1 ? C.navy : C.linea),
          fillColor: (i: number) => (i > 0 && i % 2 === 0 ? C.fondo : null),
          paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 4, paddingRight: () => 4,
        },
      },
      ...(t.nota ? [{ text: t.nota, italics: true, fontSize: 7.5, color: C.gris, margin: [0, 8, 0, 0] }] : []),
    ],
    footer: (pagina: number, total: number) => ({
      margin: [36, 12, 36, 0],
      columns: [
        { text: `${m.empresa} · ${t.titulo} · Generado por Macedonia el ${m.generado}`, fontSize: 7, color: C.gris },
        { text: `Página ${pagina} de ${total}`, fontSize: 7, color: C.gris, alignment: "right", width: 80 },
      ],
    }),
  };
  return pm.createPdf(def).getBlob();
}

/** Baja un archivo generado en el navegador. */
export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari necesita que la URL siga viva un momento despues del clic.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
