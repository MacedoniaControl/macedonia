// Genera la plantilla de Excel para cargar cuentas (en el navegador, con
// exceljs, que ya se usa para las descargas). Trae:
//   · la hoja de datos, con los títulos exactos y formatos de fecha y monto;
//   · una hoja «Instrucciones» con un ejemplo;
//   · una hoja oculta con la marca de la plantilla, que es lo que la
//     importación comprueba para saber que el archivo es este.

import { COLUMNAS, HOJA, HOJA_MARCA, MARCA, type TipoPlantilla } from "./plantilla-cuentas.ts";

export async function descargarPlantilla(tipo: TipoPlantilla, empresa: string) {
  const buf = await libroPlantilla(tipo, empresa);
  const { descargarBlob } = await import("@/lib/ux/tabla-archivos");
  descargarBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Plantilla ${HOJA[tipo]} - Macedonia.xlsx`);
}

/** El libro de la plantilla, aparte de la descarga para poder probarlo. */
export async function libroPlantilla(tipo: TipoPlantilla, empresa: string): Promise<ArrayBuffer> {
  const mod = await import("exceljs");
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Macedonia";
  wb.title = `Plantilla de ${HOJA[tipo]}`;

  const ws = wb.addWorksheet(HOJA[tipo], { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNAS[tipo].map((h, i) => ({ header: h, width: [34, 18, 18, 22, 14, 36][i] }));
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB5541A" } };
  cab.alignment = { vertical: "middle" };
  cab.height = 22;
  // Formatos para las filas que se van a llenar.
  for (let r = 2; r <= 1000; r++) {
    ws.getCell(r, 3).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 4).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 5).numFmt = "#,##0.00";
  }

  const quien = tipo === "cobrar" ? "Cliente" : "Proveedor";
  const ins = wb.addWorksheet("Instrucciones");
  ins.columns = [{ width: 26 }, { width: 70 }];
  const lineas: [string, string][] = [
    [`Plantilla de ${HOJA[tipo]}`, `Macedonia · ${empresa}`],
    ["", ""],
    ["Cómo se usa", `Llena la hoja «${HOJA[tipo]}», una cuenta por fila, desde la fila 2. No cambies los títulos, el orden de las columnas ni el nombre de la hoja: la importación solo admite esta plantilla.`],
    [quien, `Obligatorio. Como figura en la cartera.`],
    ["Documento", "Obligatorio. N° de factura o nota de entrega. Si ya está cargado para ese " + quien.toLowerCase() + ", no se vuelve a cargar."],
    ["Fecha de emisión", "Obligatoria. dd/mm/aaaa."],
    ["Fecha de vencimiento", "Obligatoria. dd/mm/aaaa. No puede ser anterior a la emisión."],
    ["Monto USD", "Obligatorio. En dólares, mayor que cero."],
    ["Nota", "Opcional."],
    ["", ""],
    ["Ejemplo", `${tipo === "cobrar" ? "COSTA NORTE CONSTRUCCIONES, C.A." : "STAR GAS C,A"} · NE-0000012345 · 01/09/2026 · 16/09/2026 · 1.250,00`],
  ];
  lineas.forEach(([a, b], i) => {
    const f = ins.getRow(i + 1);
    f.getCell(1).value = a; f.getCell(2).value = b;
    f.getCell(1).font = { bold: true };
    f.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  ins.getRow(1).font = { bold: true, size: 14 };

  // La marca: sin ella, el archivo no se admite.
  const marca = wb.addWorksheet(HOJA_MARCA, { state: "hidden" });
  marca.getCell("A1").value = MARCA[tipo];

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
