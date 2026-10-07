"use client";

// El estado de cuenta de un cliente (Cuentas por Cobrar) o de un proveedor
// (Cuentas por Pagar), en PDF.
//
// Pedido del usuario (07-10-2026): el botón «Descargar PDF» dentro de cada
// cliente. Con «Pagadas» encendido incluye las pagadas; apagado, solo lo que
// muestra la pantalla. Arriba: el logo de la empresa, la fecha en que se emite,
// «RIF … · Cuenta por Cobrar» y nada más de la empresa; luego los datos del
// cliente, como en la nota de entrega.

import { EMPRESAS, type EmpresaId } from "@/lib/ux/empresas";
import { C, logoDe } from "@/lib/ux/estilo-documentos";
import { descargarBlob, motorPdf } from "@/lib/ux/tabla-archivos";
import { fmtUsd } from "@/lib/ux/format";
import { fechaVista } from "@/lib/ux/tabla-export";

export type FilaEstadoCuenta = {
  documento: string; clase: string; emitida: string; vence: string;
  monto: number; saldo: number; estado: string;
};

export type EstadoCuenta = {
  empresa: EmpresaId;
  /** Por defecto, por cobrar (un cliente). */
  tipo?: "cobrar" | "pagar";
  emitido: string; // AAAA-MM-DD
  cliente: { nombre: string; rif?: string | null; telefonos?: string | null; direccion?: string | null };
  filas: FilaEstadoCuenta[];
  conPagadas: boolean;
};

const limpio = (d: string) => d.split("·")[0].trim();

export async function estadoCuentaPdf(e: EstadoCuenta): Promise<Blob> {
  const pm = await motorPdf();
  const emp = EMPRESAS[e.empresa];
  const titulo = e.tipo === "pagar" ? "Cuenta por Pagar" : "Cuenta por Cobrar";
  const quien = e.tipo === "pagar" ? "PROVEEDOR" : "CLIENTE";
  const logo = logoDe(e.empresa);
  const totalMonto = e.filas.reduce((a, f) => a + f.monto, 0);
  const totalSaldo = e.filas.reduce((a, f) => a + f.saldo, 0);
  const k = (t: string) => ({ text: t, bold: true, color: C.navy, fontSize: 8 });
  const v = (t: string | null | undefined) => ({ text: t?.trim() || "—", fontSize: 9 });

  const cabecera = ["Documento", "Clase", "Emisión", "Vence", "Monto", "Saldo", "Estado"].map((t, i) => ({
    text: t, bold: true, color: "#ffffff", fillColor: C.navy, alignment: i >= 4 && i <= 5 ? "right" : "left", noWrap: true,
  }));
  const body = [
    cabecera,
    ...e.filas.map((f) => [
      { text: limpio(f.documento), font: "Roboto" }, f.clase, fechaVista(f.emitida), fechaVista(f.vence),
      { text: fmtUsd(f.monto), alignment: "right" }, { text: fmtUsd(f.saldo), alignment: "right", bold: f.saldo > 0 },
      { text: f.estado, color: /Vencid/.test(f.estado) ? C.rojo : /Pagad/.test(f.estado) ? C.gris : C.tinta },
    ]),
    [
      { text: `Total · ${e.filas.length} documento(s)`, bold: true, colSpan: 4 }, "", "", "",
      { text: fmtUsd(totalMonto), alignment: "right", bold: true }, { text: fmtUsd(totalSaldo), alignment: "right", bold: true }, "",
    ],
  ];

  const def = {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 40],
    info: { title: `${titulo} · ${e.cliente.nombre}`, subject: emp.nombre },
    defaultStyle: { font: "Roboto", fontSize: 8.5, color: C.tinta },
    content: [
      {
        columns: [
          { image: logo.src, width: logo.ancho, height: logo.alto },
          { stack: [
            { text: titulo, bold: true, fontSize: 14, color: C.navy, alignment: "right" },
            { text: `RIF ${emp.rif}`, bold: true, fontSize: 9, color: C.marron, alignment: "right", margin: [0, 2, 0, 0] },
            { text: `Emitida el ${fechaVista(e.emitido)}`, fontSize: 8.5, color: C.gris, alignment: "right", margin: [0, 2, 0, 0] },
          ] },
        ],
        margin: [0, 0, 0, 12],
      },
      {
        table: {
          widths: [62, "*", 40, 110],
          body: [
            [k(quien), v(e.cliente.nombre), k("TLF"), v(e.cliente.telefonos)],
            [k("RIF"), v(e.cliente.rif), { text: "" }, { text: "" }],
            [k("DIRECCIÓN"), { ...v(e.cliente.direccion), colSpan: 3 }, "", ""],
          ],
        },
        layout: {
          hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => C.linea, vLineColor: () => C.linea,
          paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 5, paddingRight: () => 5,
        },
        margin: [0, 0, 0, 12],
      },
      {
        table: { headerRows: 1, widths: ["auto", "*", "auto", "auto", "auto", "auto", "auto"], body },
        layout: {
          hLineWidth: (i: number) => (i === body.length - 1 ? 1 : 0.4),
          vLineWidth: () => 0,
          hLineColor: (i: number) => (i === body.length - 1 ? C.navy : C.linea),
          fillColor: (i: number) => (i > 0 && i < body.length - 1 && i % 2 === 0 ? C.fondo : null),
          paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 4, paddingRight: () => 4,
        },
      },
      {
        columns: [
          { text: "" },
          { width: 200, table: { widths: ["*", "auto"], body: [
            [{ text: "SALDO PENDIENTE", bold: true, color: C.navy }, { text: fmtUsd(totalSaldo), bold: true, fontSize: 11, alignment: "right" }],
          ] }, layout: "noBorders" },
        ],
        margin: [0, 10, 0, 0],
      },
    ],
    footer: (pagina: number, total: number) => ({
      margin: [36, 12, 36, 0],
      text: `Página ${pagina} de ${total}`, fontSize: 7, color: C.gris, alignment: "right",
    }),
  };
  return pm.createPdf(def).getBlob();
}

/** Arma y baja el PDF: «Cuenta por Cobrar - CLIENTE - AAAA-MM-DD.pdf» (o «Cuenta por Pagar - PROVEEDOR …»). */
export async function descargarEstadoCuenta(e: EstadoCuenta) {
  const blob = await estadoCuentaPdf(e);
  const nombre = e.cliente.nombre.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  descargarBlob(blob, `${e.tipo === "pagar" ? "Cuenta por Pagar" : "Cuenta por Cobrar"} - ${nombre} - ${e.emitido}.pdf`);
}
