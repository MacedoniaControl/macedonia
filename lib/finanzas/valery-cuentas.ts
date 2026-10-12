// Cuentas por cobrar y por pagar desde los reportes de Valery, tal como salen.
//
//   Por cobrar · «Estado de Cuenta de Clientes»: una fila «- | Descripción
//     Cliente : NOMBRE» por cliente, debajo sus documentos y una fila de
//     subtotal. El monto de cada documento es el Saldo Inicial (más débitos,
//     menos créditos y anticipos); la columna «Saldo» es el ACUMULADO del
//     cliente, no el del documento. Valery no trae la fecha de vencimiento.
//   Por pagar · «Relación de Cuentas por Pagar a Proveedores»: igual, con
//     «- | Proveedor Descrip. : NOMBRE». Dos variantes de columnas: facturas
//     (con BI, IVA, IVA retenido) y notas (con Monto). El monto es «Saldo»:
//     lo que falta pagar, ya sin la retención ni lo abonado.
//
// Se reconoce por la cabecera exacta, en cualquiera de las primeras filas.
// También se acepta un pedazo del reporte copiado a un libro nuevo, sin la
// cabecera: si trae la fila «Descripción Cliente …» (o «Proveedor Descrip. …»)
// se leen las columnas en el orden del reporte. Junto con la plantilla de
// Macedonia (plantilla-cuentas.ts), es lo único que admite la importación.

import { aFechaPlantilla, fechaFinDeMes, type FilaPlantilla, type TipoPlantilla } from "./plantilla-cuentas.ts";
import type { ClaseCuenta } from "./retencion.ts";
import { venceNotaEntrega } from "./vencimiento.ts";
import { aMonto, CASI_CERO } from "../ux/decimales.ts";
import { repartoInicial } from "./repartir-pago.ts";

export type Celda = string | number | boolean | null;
export type HojaLeida = { nombre: string; filas: Celda[][] };

const t = (v: Celda | undefined) => (v === null || v === undefined ? "" : String(v).trim());
const cabeceraDe = (fila: Celda[]) => { const c = fila.map(t); while (c.length && !c[c.length - 1]) c.pop(); return c; };

export const CABECERAS_VALERY = {
  cobrar: [["Tipo Doc.", "", "Documento", "Fecha Emisión", "Fecha Venc.", "Concepto", "Saldo Inicial", "Anticipo", "Débito", "Crédito", "Saldo"]],
  pagar: [
    ["Tipo Doc.", "", "Documento", "Fecha Emisión", "Fecha Venc.", "Días Vencidos", "Concepto", "BI", "IVA", "Total Operación",
      "IVA RETENIDO (75%)", "REF 25% IVA Bs", "REF Equiv. En $", "Monto Cancelado", "Saldo"],
    ["Tipo Doc.", "", "Documento", "Fecha Emisión", "Fecha Venc.", "Días Vencidos", "Concepto", "Monto", "Total Operación", "Monto Cancelado", "Saldo"],
  ],
} as const;

const NOMBRE = { cobrar: "el «Estado de Cuenta de Clientes»", pagar: "la «Relación de Cuentas por Pagar a Proveedores»" } as const;
const GRUPO = { cobrar: /^Descripci[oó]n Cliente\s*:?\s*/i, pagar: /^Proveedor Descrip\.?\s*:?\s*/i } as const;

/** De qué reporte de Valery es una hoja (null = de ninguno). */
export function reporteValery(cabecera: Celda[]): TipoPlantilla | null {
  const c = cabeceraDe(cabecera);
  for (const tipo of ["cobrar", "pagar"] as const) {
    if (CABECERAS_VALERY[tipo].some((e) => e.length === c.length && e.every((x, i) => c[i] === x))) return tipo;
  }
  return null;
}

/** Cuántas filas de arriba se miran buscando la cabecera (Valery a veces pone títulos encima). */
const FILAS_TITULO = 10;

/**
 * Cómo leer una hoja: de qué reporte es, sus columnas y desde qué fila van los
 * datos. null = no es de Valery.
 *
 * Sin cabecera, la hoja es de Valery solo si tiene la fila de grupo del cliente
 * o proveedor Y algún documento con fecha de emisión en su columna: un archivo
 * cualquiera no se lee como si lo fuera.
 */
export function disposicionValery(h: HojaLeida): { tipo: TipoPlantilla; cab: string[]; desde: number } | null {
  for (let i = 0; i < Math.min(FILAS_TITULO, h.filas.length); i++) {
    const tipo = reporteValery(h.filas[i] ?? []);
    if (tipo) return { tipo, cab: cabeceraDe(h.filas[i]), desde: i + 1 };
  }
  for (const tipo of ["cobrar", "pagar"] as const) {
    if (!h.filas.some((f) => GRUPO[tipo].test(t(f[1])))) continue;
    const ancho = Math.max(...h.filas.map((f) => cabeceraDe(f).length));
    const cab = [...(tipo === "pagar" && ancho <= CABECERAS_VALERY.pagar[1].length ? CABECERAS_VALERY.pagar[1] : CABECERAS_VALERY[tipo][0])];
    const emision = cab.indexOf("Fecha Emisión");
    const conDocumento = h.filas.some((f) => t(f[1]) && !GRUPO[tipo].test(t(f[1])) && aFechaPlantilla(t(f[emision])));
    if (conDocumento) return { tipo, cab, desde: 0 };
  }
  return null;
}

/** Por qué las hojas no son el reporte de Valery que va en esta pantalla. null = sí lo son. */
export function errorDeValery(tipo: TipoPlantilla, hojas: HojaLeida[]): string | null {
  const tipos = hojas.map((h) => disposicionValery(h)?.tipo ?? null);
  if (tipos.includes(tipo)) return null;
  const otro: TipoPlantilla = tipo === "cobrar" ? "pagar" : "cobrar";
  if (tipos.includes(otro)) {
    return `Este archivo es ${NOMBRE[otro]} de Valery: va en Cuentas ${otro === "cobrar" ? "por Cobrar" : "por Pagar"}, no aquí.`;
  }
  return null;
}

export const esValery = (hojas: HojaLeida[]) => hojas.some((h) => disposicionValery(h) !== null);

/** «NE» → nota de entrega; «NDE» (en por pagar, la nota de entrega del proveedor); lo demás, factura. */
function claseDe(tipoDoc: string): ClaseCuenta {
  const d = tipoDoc.toUpperCase();
  if (d === "NE" || d === "NET" || d === "NDE") return "nota_entrega";
  if (d === "NDC" || d === "NC" || d === "NCR") return "nota_credito";
  if (d === "NDB" || d === "ND") return "nota_debito";
  return "factura";
}

const num = (v: Celda | undefined) => (typeof v === "number" ? v : Number(t(v).replace(",", ".")) || 0);
const dosDec = aMonto;
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export type FilaValery = FilaPlantilla & { clase: ClaseCuenta; hoja: string; linea: number; sinVencimiento: boolean; sinNumero: boolean };

/**
 * Por cobrar: un crédito de Valery mayor que el débito de su nota. Valery carga
 * el pago entero en una nota aunque sea más grande que ella (débito 6, crédito
 * 110); su «Saldo» es el acumulado del cliente, así que en el Excel no se ve
 * nada negativo. La nota entra con su débito y el crédito se liquida al
 * importar: salda esa nota y lo que sobra va a otras del mismo cliente.
 */
export type CreditoValery = { contraparte: string; documento: string; linea: number; credito: number };
export type LecturaValery = {
  filas: FilaValery[];
  problemas: { linea: number; motivo: string }[];
  /** Documentos con saldo 0 (ya pagados): no se cargan. */
  enCero: number;
  /** Por cobrar: cuántas venían sin vencimiento. */
  sinVencimiento: number;
  /** Saldos viejos sin número de documento: entran como «S/N fecha». */
  sinNumero: number;
  /** Por cobrar: los créditos que hay que liquidar al importar (ver CreditoValery). */
  creditos: CreditoValery[];
};

/** Lee todas las hojas del archivo que sean del reporte de esta pantalla. */
export function leerValery(tipo: TipoPlantilla, hojas: HojaLeida[]): LecturaValery {
  const filas: FilaValery[] = [];
  const problemas: LecturaValery["problemas"] = [];
  const creditos: CreditoValery[] = [];
  let enCero = 0, sinVencimiento = 0;
  const varias = hojas.filter((h) => disposicionValery(h)?.tipo === tipo).length > 1;

  for (const h of hojas) {
    const d = disposicionValery(h);
    if (d?.tipo !== tipo) continue;
    const { cab, desde } = d;
    const col = (n: string) => cab.indexOf(n);
    const pre = varias ? `${h.nombre.trim()}, ` : "";
    let quien = "";
    // Lo que se arrastra dentro del grupo de un cliente: el tipo del documento
    // anterior (para el que viene en blanco) y un saldo anterior sin documento.
    let tipoAnterior = "", primeraDelGrupo = false;
    let saldoAnterior: { linea: number; monto: number } | null = null;
    const cerrarGrupo = () => {
      if (saldoAnterior) problemas.push({ linea: saldoAnterior.linea, motivo: `${pre}saldo anterior de ${quien} (${fmt(saldoAnterior.monto)}) sin ningún documento después para darle fecha.` });
      saldoAnterior = null;
    };
    h.filas.slice(desde).forEach((v, k) => {
      const linea = desde + k + 1;
      const c0 = t(v[0]);
      let c1 = t(v[1]);
      // La fila del cliente: Valery le pone «-» en la primera columna, pero
      // copiada a mano a veces llega sin él.
      if (c0 === "-" || GRUPO[tipo].test(c1)) {
        cerrarGrupo();
        quien = c1.replace(GRUPO[tipo], "").trim(); tipoAnterior = ""; primeraDelGrupo = true;
        return;
      }
      const primera = primeraDelGrupo;
      primeraDelGrupo = false;
      const hayDoc = !!t(v[col("Documento")]) && !!aFechaPlantilla(t(v[col("Fecha Emisión")]));
      let tipoEnBlanco = false;
      if (!c1) {
        // Un saldo arrastrado al empezar el cliente, sin documento, fecha ni
        // montos (solo el «Saldo»): entra como saldo anterior, con la fecha del
        // primer documento que le sigue.
        const vacia = ["Documento", "Fecha Emisión", "Saldo Inicial", "Anticipo", "Débito", "Crédito"].every((n) => col(n) < 0 || !t(v[col(n)]));
        if (tipo === "cobrar" && primera && quien && vacia && dosDec(num(v[col("Saldo")])) !== 0) {
          const saldo = dosDec(num(v[col("Saldo")]));
          if (saldo < 0) return void problemas.push({ linea, motivo: `${pre}saldo anterior de ${quien} negativo (${fmt(saldo)}), sin documento: regístralo a mano.` });
          saldoAnterior = { linea, monto: saldo };
          return;
        }
        // Un documento con número y fecha pero sin tipo: el del anterior del mismo cliente (o NE).
        if (!hayDoc) return;   // subtotal o fila vacía
        c1 = tipoAnterior || "NE";
        tipoEnBlanco = true;
      }
      if (/^tipo( de)? doc/i.test(c1)) return;   // los títulos escritos a mano («Tipo de documento»)
      const tipoDoc = c1.toUpperCase();
      tipoAnterior = tipoDoc;
      const emitida = aFechaPlantilla(t(v[col("Fecha Emisión")]));
      // Valery tiene saldos viejos sin número (saldos iniciales): se identifican por la fecha.
      const sinNumero = !t(v[col("Documento")]);
      const numero = sinNumero && emitida ? `S/N ${emitida.split("-").reverse().join("-")}` : t(v[col("Documento")]).replace(/\.0+$/, "");
      // Un vencimiento con un día de más («31/9») pasa a fin de ese mes, anotado.
      const vf = fechaFinDeMes(t(v[col("Fecha Venc.")]));
      const venceValery = vf.fecha;
      if (!quien) return void problemas.push({ linea, motivo: `${pre}el documento ${tipoDoc} ${numero} no tiene ${tipo === "cobrar" ? "cliente" : "proveedor"} arriba.` });
      if (!emitida) return void problemas.push({ linea, motivo: `${pre}${tipoDoc} ${numero}: fecha de emisión inválida «${t(v[col("Fecha Emisión")])}».` });

      if (saldoAnterior) {
        filas.push({
          contraparte: quien, documento: `SALDO ANTERIOR-S/N ${emitida.split("-").reverse().join("-")}`, emitida, vence: emitida,
          monto: saldoAnterior.monto, nota: `Valery · saldo anterior sin número ni fecha (va antes de la ${tipoDoc}-${numero})`,
          clase: "ajuste", hoja: h.nombre.trim(), linea: saldoAnterior.linea, sinVencimiento: true, sinNumero: true,
        });
        saldoAnterior = null;
      }

      let monto: number, nota: string;
      let credito = 0;
      if (tipo === "cobrar") {
        const cargos = num(v[col("Saldo Inicial")]) + num(v[col("Débito")]);
        const pagos = num(v[col("Crédito")]) + num(v[col("Anticipo")]);
        monto = cargos - pagos;
        const concepto = t(v[col("Concepto")]);
        nota = ["Valery", concepto, tipoEnBlanco ? "tipo de documento en blanco en Valery" : ""].filter(Boolean).join(" · ");
        // Un crédito más grande que la nota: la nota entra con su débito y el crédito se liquida al importar.
        if (dosDec(monto) < 0 && dosDec(cargos) > 0) {
          credito = dosDec(pagos);
          monto = cargos;
          nota += ` · crédito de ${fmt(credito)} en Valery, liquidado al importar`;
        }
      } else {
        monto = num(v[col("Saldo")]);
        const total = num(v[col("Total Operación")]);
        const ret = col("IVA RETENIDO (75%)") >= 0 ? num(v[col("IVA RETENIDO (75%)")]) : 0;
        const pagado = num(v[col("Monto Cancelado")]);
        nota = ["Valery", `total ${fmt(total)}`, ret ? `IVA retenido ${fmt(ret)}` : "", pagado ? `abonado ${fmt(pagado)}` : ""].filter(Boolean).join(" · ");
      }
      monto = dosDec(monto);
      if (credito) creditos.push({ contraparte: quien, documento: `${tipoDoc}-${numero}`, linea, credito });
      if (monto < 0) return void problemas.push({ linea, motivo: `${pre}${tipoDoc} ${numero} de ${quien}: saldo negativo (${fmt(monto)}).` });
      if (monto === 0) { enCero++; return; }
      // La nota de entrega (por cobrar o por pagar) vence por la regla de la
      // empresa —el mismo día del mes siguiente, o 30 días si es un 31 o fin de
      // febrero—, traiga Valery la fecha que traiga. Lo demás: la de Valery, o el
      // día que se emitió si no trae.
      const esNota = claseDe(tipoDoc) === "nota_entrega";
      const vence = esNota ? venceNotaEntrega(emitida) : venceValery && venceValery >= emitida ? venceValery : emitida;
      if (!venceValery) sinVencimiento++;
      filas.push({
        contraparte: quien, documento: `${tipoDoc}-${numero}`, emitida, vence, monto,
        nota: [nota, sinNumero ? "sin número en Valery" : "", !venceValery ? "sin vencimiento en Valery" : "",
          vf.corregida ? `vencimiento «${t(v[col("Fecha Venc.")])}» no existe: fin de mes` : ""].filter(Boolean).join(" · "),
        clase: claseDe(tipoDoc), hoja: h.nombre.trim(), linea, sinVencimiento: !venceValery, sinNumero,
      });
    });
    cerrarGrupo();
  }
  return { filas, problemas, enCero, sinVencimiento, sinNumero: filas.filter((f) => f.sinNumero).length, creditos };
}

// ---------------------------------------------------------------- duplicados
/** El número de un documento sin el tipo, sin ceros a la izquierda ni signos: «NE-0000017809» → «17809». */
export function numeroDocumento(d: string): string {
  // «NE-8432·ISMESOL» (el estado de cuenta viejo le pegaba el cliente) es la NE-8432.
  // «NE-5504 (2)» es la segunda NE-5504 del cliente: el mismo número.
  return d.split("·")[0].replace(/\s*\(\d+\)\s*$/, "").toUpperCase().replace(/^(NE|NET|NDE|NDC|NDB|ND|NC|NCR|FAC|FCM|FACT|FACTURA|NOTA)[\s\-#:.]*/, "")
    .replace(/\.0+$/, "").replace(/[^A-Z0-9]/g, "").replace(/^0+(?=.)/, "");
}

/** Nombre comparable: sin tildes, signos, espacios ni «C.A.». */
export function nombreComparable(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\(.*\)$/, "")
    .replace(/\b(C\s*[.,]?\s*A|S\s*[.,]?\s*A|S\s*[.,]?\s*R\s*[.,]?\s*L|SACA)\b\.?/g, " ").replace(/[^A-Z0-9]/g, "");
}

/** ¿Es la misma contraparte? Igual, o una abreviatura de la otra («FERREX» / «FERREX, C.A.»). */
export function mismaContraparte(a: string, b: string): boolean {
  const x = nombreComparable(a), y = nombreComparable(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length < y.length ? [x, y] : [y, x];
  return corto.length >= 4 && largo.startsWith(corto);
}

export type CuentaExistente = { contraparte: string; documento: string; monto: number; saldo: number; emitida: string };
export type Duplicada<F> = { fila: F; existente: CuentaExistente };

/** Separa las filas nuevas de las que ya están en la cartera, y las repetidas dentro del mismo archivo. */
export function separarDuplicadas<F extends FilaPlantilla & { linea?: number }>(filas: F[], cartera: CuentaExistente[]) {
  const porNumero = new Map<string, CuentaExistente[]>();
  for (const c of cartera) {
    const k = numeroDocumento(c.documento);
    porNumero.set(k, [...(porNumero.get(k) ?? []), c]);
  }
  const nuevas: F[] = [];
  const duplicadas: Duplicada<F>[] = [];
  const enArchivo: { fila: F; primera: F }[] = [];
  const vistas: F[] = [];
  for (const f of filas) {
    const k = numeroDocumento(f.documento);
    const ya = (porNumero.get(k) ?? []).find((c) => mismaContraparte(c.contraparte, f.contraparte));
    if (ya) { duplicadas.push({ fila: f, existente: ya }); continue; }
    const mismas = vistas.filter((v) => numeroDocumento(v.documento) === k && mismaContraparte(v.contraparte, f.contraparte));
    // Repetida es la misma nota dos veces (el cliente pegado dos veces en el
    // reporte). El mismo número con otra fecha de emisión es otra nota: entra
    // como «(2)», como se hizo a mano con la NE-5504 de TAGUICHO.
    const repetida = mismas.find((v) => v.emitida === f.emitida);
    if (repetida) { enArchivo.push({ fila: f, primera: repetida }); continue; }
    const g = mismas.length ? { ...f, documento: `${f.documento} (${mismas.length + 1})` } : f;
    vistas.push(f);
    nuevas.push(g);
  }
  return { nuevas, duplicadas, enArchivo };
}

// ---------------------------------------------------------------- créditos
export type PlanCredito = {
  credito: CreditoValery;
  /** Las notas (claves de `notas`) que se saldan, empezando por la del crédito. */
  saldadas: string[];
  /** Lo que sobra y a qué nota va (la de mayor saldo del cliente). */
  restante: number;
  destino: string | null;
  error: string | null;
};

/**
 * Cómo se liquida cada crédito de Valery con las notas NUEVAS del mismo cliente
 * (`notas`, con una clave cualquiera): primero su propia nota, luego las demás
 * de la más vieja a la más nueva, y el restante a la de mayor saldo — la misma
 * regla de «Liquidar». Si el cliente tiene varios créditos, cada uno cuenta
 * con lo que dejó el anterior. Un crédito cuya nota no entra (ya estaba en la
 * cartera) no se toca: ya se trató la vez anterior.
 */
export function planearCreditos(
  creditos: CreditoValery[],
  notas: { clave: string; contraparte: string; documento: string; vence: string; monto: number }[],
  formato: (n: number) => string = fmt,
): PlanCredito[] {
  const pendiente = new Map(notas.map((n) => [n.clave, n.monto]));
  const planes: PlanCredito[] = [];
  for (const c of creditos) {
    const propia = notas.find((n) => n.contraparte === c.contraparte && n.documento === c.documento);
    if (!propia) continue;
    const delCliente = notas.filter((n) => n.contraparte === c.contraparte && (pendiente.get(n.clave) ?? 0) > CASI_CERO);
    const ids = new Map(delCliente.map((n, i) => [i + 1, n.clave]));
    const r = repartoInicial(
      delCliente.map((n, i) => ({ id: i + 1, documento: n.documento, vence: n.vence, pendiente: pendiente.get(n.clave)! })),
      c.credito, [delCliente.indexOf(propia) + 1],
    );
    const saldadas = r.saldadas.map((i) => ids.get(i)!);
    const destino = r.destino !== null ? ids.get(r.destino)! : null;
    const debe = aMonto(delCliente.reduce((a, n) => a + pendiente.get(n.clave)!, 0));
    const error = !saldadas.includes(propia.clave)
      ? `el crédito de ${formato(c.credito)} no alcanza para saldar la ${c.documento}.`
      : r.restante > CASI_CERO && destino === null
        ? `el crédito de ${formato(c.credito)} es mayor que lo que debe ${c.contraparte} en el archivo (${formato(debe)}): regístralo a mano.`
        : null;
    planes.push({ credito: c, saldadas, restante: r.restante, destino, error });
    if (error) continue;
    for (const k of saldadas) pendiente.set(k, 0);
    if (destino) pendiente.set(destino, aMonto(pendiente.get(destino)! - r.restante));
  }
  return planes;
}
