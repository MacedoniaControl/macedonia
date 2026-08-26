"use client";

import { EMPRESAS, type EmpresaId } from "@/lib/ux/empresas";

/** Réplica fiel de los formatos de Valery: Nota de Entrega, Nota de Crédito y Presupuesto.
 *  FIJO = cabeceras, etiquetas y gases de cilindros.
 *  POR EMPRESA = logo, RIF, dirección, rubros y sub-bloque (vienen de lib/ux/empresas.ts).
 *  VARIABLE = cliente, artículos, fechas, montos y N° correlativo.
 *
 *  Toda función de impresión recibe la empresa activa: un documento nunca debe salir
 *  con la identidad fiscal de la otra empresa. */

/** Identidad impresa de la empresa que emite el documento. */
function identidad(empresa: EmpresaId) {
  const e = EMPRESAS[empresa];
  return {
    rif: e.rif,
    dir: e.direccionImpresa,
    rubros: e.rubros,
    subBloque: e.subBloque,
    logo: `<img src="${e.logo}" alt="${e.nombre}" class="logo">`,
  };
}
const GASES_CIL = ["OXIGENO", "ACETILENO", "ARGON", "NITROGENO"]; // orden fijo del formato

export type NELinea = { cantidad: number; unidad: string; descripcion: string; precio: number; codigo?: string; descuento?: number };
export type NECil = { gas: string; llenos: number; vacios: number };
export type NEDoc = {
  correlativo: string; fecha: string; cliente: string; rif: string; tlf: string; direccion: string; ordenCompra: string;
  lineas: NELinea[]; cilindros: NECil[];
  // Campos que Valery captura (no todos se imprimen en la constancia física):
  vendedor?: string; deposito?: string; tipoPrecio?: string; divisa?: string; notas?: string;
  /** Si el documento lleva IVA. Por defecto: sí cuando el pago es en bolívares. */
  llevaIva?: boolean;
  /** Porcentaje aplicado, de la configuración de la empresa. */
  ivaPct?: number;
};
export type DevLinea = { codigo: string; descripcion: string; cantidad: number; precio: number; descuento: number; unidad?: string };
export type PresupuestoDoc = {
  correlativo: string; fechaEmision: string; fechaVenc: string;
  razonSocial: string; rif: string; direccion: string; telefonos: string;
  lineas: DevLinea[]; moneda: string; nota: string;
  llevaIva?: boolean; ivaPct?: number;
};
export type DevDoc = {
  correlativo: string; fechaEmision: string; fechaVenc: string; referencia: string;
  razonSocial: string; rif: string; direccion: string; telefonos: string; lineas: DevLinea[]; nota: string; formaPago: string;
  llevaIva?: boolean; ivaPct?: number;
};

const m = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const lineaTotal = (l: NELinea) => l.cantidad * l.precio * (1 - (l.descuento || 0) / 100);

/**
 * Totales de una nota de entrega.
 *
 * El IVA es OPCIONAL y lo decide quien emite. Por defecto se enciende cuando el
 * pago es en bolívares, que es la regla del negocio, pero el vendedor puede
 * cambiarlo: no todos los casos son iguales y el sistema no tiene por qué
 * saberlo mejor que la persona que tiene al cliente enfrente.
 *
 * El porcentaje viene de la configuración de la empresa, no escrito aquí: antes
 * estaba fijo en 0,16 en tres sitios distintos y cambiarlo exigía tocar código.
 */
export function neTotals(d: NEDoc, ivaPct = 16) {
  const base = d.lineas.reduce((a, l) => a + lineaTotal(l), 0);
  const iva = d.llevaIva ? base * (ivaPct / 100) : 0;
  return { base, iva, total: base + iva };
}

function cilData(cils: NECil[]) {
  const g = (name: string) => cils.find((c) => c.gas.toUpperCase() === name) ?? { gas: name, llenos: 0, vacios: 0 };
  return GASES_CIL.map(g);
}

function neCopy(d: NEDoc, empresa: EmpresaId) {
  const E = identidad(empresa);
  const t = neTotals(d, d.ivaPct ?? 16);
  const filas = d.lineas.map((l) =>
    `<tr><td>${m(l.cantidad)}</td><td>${l.unidad}</td><td class="l">${l.codigo ? l.codigo + " - " : ""}${l.descripcion}</td><td class="r">${m(l.precio)}</td><td class="r">${m(lineaTotal(l))}</td></tr>`).join("");
  const c = cilData(d.cilindros);
  const cilRow = (a: NECil, b: NECil) =>
    `<tr><td class="l">${a.gas}</td><td>${a.llenos || ""}</td><td>${a.vacios || ""}</td><td class="l">${b.gas}</td><td>${b.llenos || ""}</td><td>${b.vacios || ""}</td></tr>`;
  return `<div class="copy">
    <div class="top">${E.logo}
      <div class="box num"><div class="tit">CONSTANCIA DE<br>RECEPCION DE MATERIALES</div><div class="n">N° &nbsp;&nbsp; ${d.correlativo}</div></div>
    </div>
    ${E.rubros ? `<div class="rubros">${E.rubros}</div>` : ""}
    <table class="cli">
      <tr><td class="k">CLIENTE</td><td>${d.cliente}</td><td class="k">TLF</td><td>${d.tlf}</td></tr>
      <tr><td class="k">RIF</td><td>${d.rif}</td><td></td><td></td></tr>
      <tr><td class="k">DIRECCION</td><td colspan="3">${d.direccion}</td></tr>
      <tr><td class="k">FECHA</td><td>${d.fecha}</td><td class="k" colspan="2">ORDEN DE COMPRA &nbsp; ${d.ordenCompra}</td></tr>
    </table>
    <table class="items"><thead><tr><th>CANTIDAD</th><th>UNIDAD</th><th class="l">DESCRIPCION</th><th>PRECIO<br>UNITARIO</th><th>TOTAL</th></tr></thead>
      <tbody>${filas}${"<tr class='sp'><td></td><td></td><td></td><td></td><td></td></tr>".repeat(Math.max(0, 6 - d.lineas.length))}</tbody></table>
    <table class="tot">
      <tr><td class="k">BASE IMPONIBLE</td><td class="r">${m(t.base)}</td></tr>
      ${d.llevaIva ? `<tr><td class="k">IVA &nbsp; ${m(d.ivaPct ?? 16)} %</td><td class="r">${m(t.iva)}</td></tr>` : ""}
      <tr><td class="k">TOTAL OPERACION</td><td class="r">${m(t.total)}</td></tr>
    </table>
    <table class="cilt"><thead><tr><th class="l">PRODUCTO</th><th>CILINDROS<br>LLENOS</th><th>CILINDROS<br>VACIOS</th><th class="l">PRODUCTO</th><th>CILINDROS<br>LLENOS</th><th>CILINDROS<br>VACIOS</th></tr></thead>
      <tbody>${cilRow(c[0], c[1])}${cilRow(c[2], c[3])}</tbody></table>
    <table class="firmas"><tr><td>ENTREGADO</td><td>RECIBIDO CONFORME</td><td>PROCESADO</td></tr>
      <tr class="sign"><td>FECHA &nbsp; ${d.fecha}</td><td></td><td></td></tr></table>
  </div>`;
}

export function notaEntregaHtml(d: NEDoc, empresa: EmpresaId) {
  return wrap(`<div class="sheet ne">${neCopy(d, empresa)}${neCopy(d, empresa)}</div>`, `Nota de Entrega ${d.correlativo}`);
}

export function devolucionHtml(d: DevDoc, empresa: EmpresaId) {
  const E = identidad(empresa);
  const sub = d.lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  const iva = d.llevaIva === false ? 0 : sub * ((d.ivaPct ?? 16) / 100);
  const total = sub + iva;
  const filas = d.lineas.map((l) =>
    `<tr><td>${l.codigo}</td><td class="l">${l.descripcion}</td><td class="r">${m(l.cantidad)}</td><td class="r">0,00</td><td class="r">${m(l.precio)}</td><td class="r">${l.descuento.toFixed(2)} %</td><td class="r">${m(l.cantidad * l.precio * (1 - l.descuento / 100))}</td></tr>`).join("");
  const body = `<div class="copy dev">
    <div class="devhead">${E.logo}<div class="empresa"><b>${E.rif}</b><br>${E.dir}</div></div>
    <div class="devbox">
      <div class="left">
        ${E.subBloque ? `<div class="sub">${E.subBloque}</div>` : ""}
        <table class="cli"><tr><td class="k">Razón Social</td><td>${d.razonSocial}</td></tr>
          <tr><td class="k">RIF</td><td>${d.rif}</td></tr>
          <tr><td class="k">Dirección</td><td>${d.direccion}</td></tr>
          <tr><td class="k">Teléfonos</td><td>${d.telefonos}</td></tr></table>
      </div>
      <div class="right">
        <div class="nctit">Nota de Crédito Nro.<br><b>${d.correlativo}</b></div>
        <table class="fechas"><tr><td class="k">Fecha Emisión</td><td class="r">${d.fechaEmision}</td></tr>
          <tr><td class="k">Fecha Vencimiento</td><td class="r">${d.fechaVenc}</td></tr></table>
        <table class="ref"><tr><td class="k">Referencia</td><td>${d.referencia}</td></tr>
          <tr><td class="k">Fecha Emisión</td><td>${d.fechaEmision}</td></tr>
          <tr><td class="k">Total</td><td class="r">${m(total)}</td></tr></table>
      </div>
    </div>
    <table class="items"><thead><tr><th>Código Producto</th><th class="l">Descripción</th><th>Cantidad</th><th>Cant. Bon</th><th>Precio Unitario</th><th>Descuento</th><th>Total</th></tr></thead>
      <tbody>${filas}</tbody></table>
    <div class="totdev">
      <table class="l"><tr><td class="k">Sub-Total</td><td class="r">${m(sub)}</td></tr>
        <tr><td class="k">Descuento 1</td><td class="r">0,00 %&nbsp;&nbsp;0,00</td></tr>
        <tr><td class="k">Descuento 2</td><td class="r">0,00 %&nbsp;&nbsp;0,00</td></tr>
        <tr><td class="k">Flete</td><td class="r">0,00 %&nbsp;&nbsp;0,00</td></tr></table>
      <table class="r"><tr><td class="k">Total Exento</td><td class="r">0,00</td></tr>
        <tr><td class="k">Total Base Imponible</td><td class="r">${m(sub)}</td></tr>
        <tr><td class="k">Total Impuesto &nbsp;16,00 %</td><td class="r">${m(iva)}</td></tr>
        <tr><td class="k">Total IGTF &nbsp;0,00 %</td><td class="r">0,00</td></tr>
        <tr><td class="k">Total Operación</td><td class="r"><b>${m(total)}</b></td></tr></table>
    </div>
    <p class="nota">Nota: ${d.nota || ""}</p>
    <p class="nota">Forma de Pago: ${d.formaPago ? d.formaPago : "[]"}</p>
  </div>`;
  return wrap(`<div class="sheet">${body}</div>`, `Nota de Crédito ${d.correlativo}`);
}

export function presupuestoHtml(d: PresupuestoDoc, empresa: EmpresaId) {
  const E = identidad(empresa);
  const sub = d.lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  const iva = d.llevaIva === false ? 0 : sub * ((d.ivaPct ?? 16) / 100);
  const total = sub + iva;
  const filas = d.lineas.map((l) =>
    `<tr><td>${l.codigo}</td><td class="l">${l.descripcion}</td><td class="r">${m(l.cantidad)}</td><td class="r">${m(l.precio)}</td><td class="r">${l.descuento.toFixed(2)} %&nbsp;&nbsp;${m(l.cantidad * l.precio * l.descuento / 100)}</td><td class="r">${m(l.cantidad * l.precio * (1 - l.descuento / 100))}</td></tr>`).join("");
  const body = `<div class="copy dev">
    <div class="devhead">${E.logo}<div class="empresa"><b>${E.rif}</b><br>${E.dir}</div></div>
    <div class="devbox">
      <div class="left">
        <table class="cli"><tr><td class="k">Razón Social</td><td>${d.razonSocial}</td></tr>
          <tr><td class="k">RIF</td><td>${d.rif}</td></tr>
          <tr><td class="k">Dirección</td><td>${d.direccion}</td></tr>
          <tr><td class="k">Teléfonos</td><td>${d.telefonos}</td></tr></table>
      </div>
      <div class="right">
        <div class="nctit">Presupuesto Nro.<br><b>${d.correlativo}</b></div>
        <table class="fechas"><tr><td class="k">Fecha Emisión</td><td class="r">${d.fechaEmision}</td></tr>
          <tr><td class="k">Fecha Vencimiento</td><td class="r">${d.fechaVenc}</td></tr></table>
      </div>
    </div>
    <table class="items"><thead><tr><th>Código Producto</th><th class="l">Descripción</th><th>Cantidad</th><th>Precio Unitario</th><th>Descuento</th><th>Total</th></tr></thead>
      <tbody>${filas}</tbody></table>
    <div class="totdev">
      <table class="l"><tr><td class="k">Sub-Total</td><td class="r">${m(sub)}</td></tr>
        <tr><td class="k">Descuento 1</td><td class="r">0,00 %&nbsp;&nbsp;0,00</td></tr>
        <tr><td class="k">Descuento 2</td><td class="r">0,00 %&nbsp;&nbsp;0,00</td></tr>
        <tr><td class="k">Flete</td><td class="r">0,00 %&nbsp;&nbsp;0,00</td></tr></table>
      <table class="r"><tr><td class="k">Total Exento</td><td class="r">0,00</td></tr>
        <tr><td class="k">Total Base Imponible</td><td class="r">${m(sub)}</td></tr>
        <tr><td class="k">Total Impuesto &nbsp;16,00 %</td><td class="r">${m(iva)}</td></tr>
        <tr><td class="k">Total IGTF &nbsp;0,00 %</td><td class="r">0,00</td></tr>
        <tr><td class="k">Total Operación</td><td class="r"><b>${m(total)}</b></td></tr></table>
    </div>
    <p class="nota">Nota: ${d.nota || ""}</p>
    <hr class="foot">
    <p class="nota">Presupuesto expresado en: ${d.moneda}</p>
    <p class="nota">COTIZACIÓN #: ${d.correlativo}. SIN DERECHO A CRÉDITO FISCAL</p>
  </div>`;
  return wrap(`<div class="sheet">${body}</div>`, `Presupuesto ${d.correlativo}`);
}

function wrap(inner: string, title: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>
    *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
    body{margin:0;padding:12px;color:#111;font-size:11px}
    .logo{width:150px;height:auto;image-rendering:auto}
    .sheet{display:flex;gap:10px}.sheet.ne .copy{width:50%}.sheet .copy{width:100%}
    .top{display:flex;justify-content:space-between;align-items:flex-start}
    .box.num{border:1px solid #111;padding:3px 8px;text-align:center;font-size:10px;min-width:160px}
    .box.num .tit{font-weight:bold;line-height:1.15}.box.num .n{margin-top:3px}
    .rubros{font-size:6px;margin:6px 0 2px;border-bottom:1px solid #111;padding-bottom:2px}
    table{border-collapse:collapse;width:100%;margin-top:3px}
    td,th{border:1px solid #333;padding:2px 4px;text-align:center;font-size:8.5px;vertical-align:top}
    .cli td{border:1px solid #333}.cli .k{font-weight:bold;background:#f4f4f4;white-space:nowrap}
    .items th{background:#f4f4f4}.items .sp td{height:15px;border-left:1px solid #333;border-right:1px solid #333;border-top:0;border-bottom:0}
    .l{text-align:left}.r{text-align:right}
    .tot{width:58%;margin-left:auto}.tot .k{font-weight:bold}
    .cilt{margin-top:6px}.cilt th{background:#f4f4f4;font-size:7.5px}
    .firmas{margin-top:0}.firmas .sign td{height:46px;vertical-align:top;text-align:left}
    /* Nota de crédito */
    .devhead{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:4px}
    .empresa{font-size:8px;text-align:right;max-width:55%}
    .devbox{display:flex;gap:8px;border:1px solid #111;margin-top:6px;padding:6px}
    .devbox .left{flex:1.3}.devbox .right{flex:1}
    .sub{font-size:7px;margin-bottom:4px}
    .nctit{text-align:right;font-size:13px;line-height:1.2;margin-bottom:4px}
    .fechas td,.ref td{border:0;font-size:9px;padding:1px 2px}.ref{border:1px solid #111;margin-top:4px}
    .totdev{display:flex;gap:10px;margin-top:8px}.totdev table{width:50%}.totdev td{border:0;font-size:9px}.totdev .k{font-weight:normal}
    .nota{font-size:9px;margin:6px 0 0}
    .foot{border:0;border-top:1px solid #111;margin:8px 0 4px}
    @media print{body{padding:0}}
  </style></head><body>${inner}
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}

export function printDoc(html: string) {
  const w = window.open("", "_blank", "width=1024,height=720");
  if (!w) { alert("Permite las ventanas emergentes para imprimir/guardar el PDF."); return; }
  w.document.write(html);
  w.document.close();
}
