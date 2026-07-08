"use client";

/** Plantillas HTML que replican los formatos de Valery (Nota de Entrega y Nota de Crédito/Devolución)
 *  para imprimir o guardar como PDF desde SumiControl. */

export type NELinea = { cantidad: number; unidad: string; descripcion: string; precio: number };
export type NECil = { gas: string; llenos: number; vacios: number };
export type NEDoc = {
  correlativo: string;
  fecha: string;
  cliente: string;
  rif: string;
  tlf: string;
  direccion: string;
  ordenCompra: string;
  lineas: NELinea[];
  cilindros: NECil[];
};

export type DevLinea = { codigo: string; descripcion: string; cantidad: number; precio: number; descuento: number };
export type DevDoc = {
  correlativo: string;
  fechaEmision: string;
  fechaVenc: string;
  referencia: string;
  razonSocial: string;
  rif: string;
  direccion: string;
  telefonos: string;
  lineas: DevLinea[];
  nota: string;
  formaPago: string;
};

const m = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const HEAD = `<div class="logo">SUMIGASES<span> ORIENTE</span></div>`;
const RUBROS = "ELECTRODOS - GASES INDUSTRIALES/MEDICINALES - ROLINERAS - CORREAS - CADENAS ACOPLES - POLEAS";

export function neTotals(d: NEDoc) {
  const base = d.lineas.reduce((a, l) => a + l.cantidad * l.precio, 0);
  const iva = base * 0.16;
  return { base, iva, total: base + iva };
}

function neCopy(d: NEDoc) {
  const t = neTotals(d);
  const filas = d.lineas
    .map(
      (l) => `<tr><td>${m(l.cantidad)}</td><td>${l.unidad}</td><td class="l">${l.descripcion}</td><td class="r">${m(l.precio)}</td><td class="r">${m(l.cantidad * l.precio)}</td></tr>`,
    )
    .join("");
  const cil = d.cilindros
    .map((c) => `<tr><td class="l">${c.gas}</td><td>${c.llenos || ""}</td><td>${c.vacios || ""}</td></tr>`)
    .join("");
  return `
  <div class="copy">
    <div class="top">${HEAD}
      <div class="box num"><b>CONSTANCIA DE<br>RECEPCION DE MATERIALES</b><div>N° &nbsp; ${d.correlativo}</div></div>
    </div>
    <div class="rubros">${RUBROS}</div>
    <table class="cli"><tr><td class="k">CLIENTE</td><td>${d.cliente}</td><td class="k">TLF</td><td>${d.tlf}</td></tr>
      <tr><td class="k">RIF</td><td>${d.rif}</td><td></td><td></td></tr>
      <tr><td class="k">DIRECCION</td><td colspan="3">${d.direccion}</td></tr>
      <tr><td class="k">FECHA</td><td>${d.fecha}</td><td class="k" colspan="2">ORDEN DE COMPRA &nbsp; ${d.ordenCompra}</td></tr>
    </table>
    <table class="items"><thead><tr><th>CANTIDAD</th><th>UNIDAD</th><th class="l">DESCRIPCION</th><th>PRECIO UNIT.</th><th>TOTAL</th></tr></thead><tbody>${filas}</tbody></table>
    <table class="tot"><tr><td class="k">BASE IMPONIBLE</td><td class="r">${m(t.base)}</td></tr>
      <tr><td class="k">IVA 16,00 %</td><td class="r">${m(t.iva)}</td></tr>
      <tr><td class="k">TOTAL OPERACION</td><td class="r">${m(t.total)}</td></tr></table>
    <table class="cilt"><thead><tr><th class="l">PRODUCTO</th><th>LLENOS</th><th>VACIOS</th></tr></thead><tbody>${cil}</tbody></table>
    <table class="firmas"><tr><td>ENTREGADO</td><td>RECIBIDO CONFORME</td><td>PROCESADO</td></tr>
      <tr class="sign"><td>FECHA ${d.fecha}</td><td></td><td></td></tr></table>
  </div>`;
}

export function notaEntregaHtml(d: NEDoc) {
  return wrap(`<div class="sheet ne">${neCopy(d)}${neCopy(d)}</div>`, `Nota de Entrega ${d.correlativo}`);
}

export function devolucionHtml(d: DevDoc) {
  const sub = d.lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
  const iva = sub * 0.16;
  const total = sub + iva;
  const filas = d.lineas
    .map(
      (l) => `<tr><td>${l.codigo}</td><td class="l">${l.descripcion}</td><td class="r">${m(l.cantidad)}</td><td class="r">${m(l.precio)}</td><td class="r">${l.descuento.toFixed(2)} %</td><td class="r">${m(l.cantidad * l.precio * (1 - l.descuento / 100))}</td></tr>`,
    )
    .join("");
  const body = `
  <div class="copy dev">
    <div class="top">${HEAD}
      <div class="box num"><b>Nota de Crédito Nro.</b><div>${d.correlativo}</div></div>
    </div>
    <div class="rif">J-502789510 · AV BOLIVAR, PUERTO LA CRUZ, ANZOÁTEGUI</div>
    <table class="cli"><tr><td class="k">Razón Social</td><td>${d.razonSocial}</td>
        <td class="k">Fecha Emisión</td><td>${d.fechaEmision}</td></tr>
      <tr><td class="k">RIF</td><td>${d.rif}</td><td class="k">Fecha Vencimiento</td><td>${d.fechaVenc}</td></tr>
      <tr><td class="k">Dirección</td><td>${d.direccion}</td><td class="k">Referencia</td><td>${d.referencia}</td></tr>
      <tr><td class="k">Teléfonos</td><td>${d.telefonos}</td><td></td><td></td></tr></table>
    <table class="items"><thead><tr><th>Código</th><th class="l">Descripción</th><th>Cantidad</th><th>Precio Unit.</th><th>Descuento</th><th>Total</th></tr></thead><tbody>${filas}</tbody></table>
    <table class="tot dev"><tr><td class="k">Sub-Total</td><td class="r">${m(sub)}</td><td class="k">Total Base Imponible</td><td class="r">${m(sub)}</td></tr>
      <tr><td class="k">Flete</td><td class="r">0,00</td><td class="k">Total Impuesto 16,00 %</td><td class="r">${m(iva)}</td></tr>
      <tr><td class="k">Total IGTF</td><td class="r">0,00</td><td class="k">Total Operación</td><td class="r"><b>${m(total)}</b></td></tr></table>
    <p class="nota">Nota: ${d.nota || ""}</p>
    <p class="nota">Forma de Pago: ${d.formaPago || ""}</p>
  </div>`;
  return wrap(`<div class="sheet">${body}</div>`, `Nota de Crédito ${d.correlativo}`);
}

function wrap(inner: string, title: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title>
  <style>
    *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
    body{margin:0;padding:14px;color:#111;font-size:11px}
    .logo{font-weight:800;color:#1e5bb8;font-size:22px;letter-spacing:.5px}
    .logo span{color:#e08a2b;font-size:9px;letter-spacing:3px;display:block;margin-top:-4px}
    .sheet{display:flex;gap:10px}.sheet.ne .copy{width:50%}.sheet .copy{width:100%}
    .copy{border:0}
    .top{display:flex;justify-content:space-between;align-items:flex-start}
    .box.num{border:1px solid #111;padding:3px 6px;text-align:center;font-size:10px;min-width:150px}
    .box.num div{margin-top:2px}
    .rubros{font-size:6.5px;margin:6px 0;border-bottom:1px solid #111;padding-bottom:2px}
    .rif{font-size:8px;margin:4px 0}
    table{border-collapse:collapse;width:100%;margin-top:4px}
    td,th{border:1px solid #333;padding:2px 4px;text-align:center;font-size:9px}
    .cli td{border:1px solid #333}.cli .k{font-weight:bold;background:#f2f2f2;white-space:nowrap}
    .items th{background:#f2f2f2}.l{text-align:left}.r{text-align:right}
    .tot{width:60%;margin-left:auto}.tot.dev{width:100%}
    .cilt{margin-top:6px}.firmas{margin-top:6px}.firmas .sign td{height:44px;vertical-align:top}
    .nota{font-size:9px;margin:6px 0}
    @media print{body{padding:0}}
  </style></head><body>${inner}
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
  </body></html>`;
}

export function printDoc(html: string) {
  const w = window.open("", "_blank", "width=1000,height=700");
  if (!w) return alert("Permite las ventanas emergentes para imprimir/guardar el PDF.");
  w.document.write(html);
  w.document.close();
}
