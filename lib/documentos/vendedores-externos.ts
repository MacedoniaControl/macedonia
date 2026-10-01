// Panel de vendedores externos: lo que cotizó y lo que vendió cada vendedor de
// afuera del personal, y su comisión.
//
//   · Cotizado = cotizaciones a su nombre. Vendido = notas de entrega a su
//     nombre: es la venta que se concretó.
//   · La comisión se calcula sobre lo VENDIDO, sin IVA (el total que guarda el
//     documento es cantidad × precio − descuento, sin impuesto).
//   · Hay un porcentaje general por empresa y uno propio por vendedor, que
//     manda si existe. Sin porcentaje no hay comisión: no se inventa.
//   · El mismo vendedor escrito distinto («Juan Pérez» / «JUAN PEREZ») es uno.

export type DocExterno = {
  id: number; tipo: "cotizacion" | "nota_entrega" | string; correlativo: string; fecha: string;
  cliente: string; vendedorExterno: string | null; total: number;
};

/** Cómo se reconoce al mismo vendedor: sin tildes, mayúsculas ni espacios de más. */
export const claveVendedor = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Clave de la configuración donde se guarda el porcentaje propio de un vendedor. */
export const claveComision = (vendedor: string) => `comision_externo:${claveVendedor(vendedor)}`;
export const CLAVE_COMISION_GENERAL = "comision_externos_pct";

export type Comisiones = { general: number | null; porVendedor: Record<string, number> };

/** Los porcentajes desde la configuración de la empresa. */
export function comisionesDe(config: Record<string, string>): Comisiones {
  const pct = (v: string | undefined) => {
    if (v === undefined || v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  const porVendedor: Record<string, number> = {};
  for (const [k, v] of Object.entries(config)) {
    if (!k.startsWith("comision_externo:")) continue;
    const n = pct(v);
    if (n !== null) porVendedor[k.slice("comision_externo:".length)] = n;
  }
  return { general: pct(config[CLAVE_COMISION_GENERAL]), porVendedor };
}

export type FilaVendedor = {
  clave: string;
  /** Cómo se escribió la última vez. */
  nombre: string;
  cotizaciones: number; cotizado: number;
  notas: number; vendido: number;
  /** Lo vendido sobre lo cotizado (null si no cotizó). */
  conversion: number | null;
  /** El porcentaje que se aplica, y si es el propio del vendedor. */
  pct: number | null; propio: boolean;
  comision: number | null;
  docs: DocExterno[];
};

const dos = (n: number) => Math.round(n * 100) / 100;

/** Una fila por vendedor, de mayor a menor vendido. */
export function resumenVendedores(docs: DocExterno[], comisiones: Comisiones): FilaVendedor[] {
  const filas = new Map<string, FilaVendedor>();
  const ordenados = [...docs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  for (const d of ordenados) {
    const nombre = (d.vendedorExterno ?? "").replace(/\s+/g, " ").trim();
    if (!nombre) continue;
    const clave = claveVendedor(nombre);
    const f = filas.get(clave) ?? {
      clave, nombre, cotizaciones: 0, cotizado: 0, notas: 0, vendido: 0, conversion: null, pct: null, propio: false, comision: null, docs: [],
    };
    f.nombre = nombre;
    if (d.tipo === "cotizacion") { f.cotizaciones++; f.cotizado += d.total; }
    else if (d.tipo === "nota_entrega") { f.notas++; f.vendido += d.total; }
    else continue;
    f.docs.push(d);
    filas.set(clave, f);
  }
  return [...filas.values()].map((f) => {
    const propio = comisiones.porVendedor[f.clave];
    const pct = propio ?? comisiones.general;
    return {
      ...f, cotizado: dos(f.cotizado), vendido: dos(f.vendido),
      conversion: f.cotizado > 0 ? dos((f.vendido / f.cotizado) * 100) : null,
      pct, propio: propio !== undefined,
      comision: pct === null ? null : dos((f.vendido * pct) / 100),
      docs: [...f.docs].reverse(),
    };
  }).sort((a, b) => b.vendido - a.vendido || b.cotizado - a.cotizado || a.nombre.localeCompare(b.nombre));
}

/** Los nombres ya usados, para sugerirlos al escribir (el más reciente de cada uno). */
export function nombresUsados(nombres: (string | null)[]): string[] {
  const m = new Map<string, string>();
  for (const n of nombres) {
    const limpio = (n ?? "").replace(/\s+/g, " ").trim();
    if (limpio && !m.has(claveVendedor(limpio))) m.set(claveVendedor(limpio), limpio);
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}
