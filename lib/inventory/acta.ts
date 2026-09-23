// El acta de un conteo cerrado, como datos.
//
// Aritmetica pura, aparte de quien la lee y de quien la dibuja: asi se prueba
// sola, y el Excel, el PDF y la pantalla del historial dicen exactamente lo
// mismo porque salen del mismo objeto.

export type LineaEntrada = {
  renglon: number | null;
  codigo: string;
  nombre: string | null;
  unidad: string | null;
  cantidad: number;
  /** La existencia del sistema tomada al cerrar. */
  existencia_sistema: number | null;
  observacion: string | null;
};

export type LineaActa = {
  renglon: number | null;
  codigo: string;
  nombre: string;
  unidad: string;
  /** null solo para un articulo nuevo: no existia en el sistema. */
  sistema: number | null;
  contado: number;
  /** contado - sistema. null para un articulo nuevo. */
  diferencia: number | null;
  observacion: string;
  esNuevo: boolean;
  /** Solo en el acta valorizada. */
  costo?: number | null;
  valor?: number | null;
};

export type EventoActa = { en: string; tipo: string; detalle: string };

export type Acta = {
  numero: string;
  empresa: string;
  departamento: string;
  fecha: string;
  conto: string;
  abiertoEn: string;
  cerradoEn: string;
  lineas: LineaActa[];
  eventos: EventoActa[];
  resumen: { renglones: number; coinciden: number; faltantes: number; sobrantes: number; nuevos: number; sinContar: number };
  sinContar: { codigo: string; nombre: string; unidad: string; sistema: number }[];
};

export type ActaValorizada = Acta & {
  valor: { faltantes: number; sobrantes: number; neto: number; sinCosto: number };
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Un SKU de Macedonia: el articulo no existia en Valery cuando se conto. */
export const esSkuMacedonia = (codigo: string) => /^MC-\d{6}$/.test(codigo);

export function armarActa(d: {
  numero: string; empresa: string; departamento: string; fecha: string; conto: string;
  abiertoEn: string; cerradoEn: string;
  lineas: LineaEntrada[]; eventos: EventoActa[];
  sinContar?: { codigo: string; nombre: string; unidad: string | null; sistema: number }[];
}): Acta {
  const lineas: LineaActa[] = d.lineas
    .map((l) => {
      const esNuevo = esSkuMacedonia(l.codigo);
      const sistema = esNuevo ? null : r3(Number(l.existencia_sistema ?? 0));
      return {
        renglon: l.renglon,
        codigo: l.codigo,
        nombre: (l.nombre ?? l.codigo).replace(/\s+/g, " ").trim(),
        unidad: l.unidad ?? "",
        sistema,
        contado: r3(Number(l.cantidad)),
        diferencia: sistema === null ? null : r3(Number(l.cantidad) - sistema),
        observacion: (l.observacion ?? "").trim(),
        esNuevo,
      };
    })
    // El orden del papel. Lo que se agrego fuera de la planilla va al final.
    .sort((a, b) => (a.renglon ?? 1e9) - (b.renglon ?? 1e9) || a.nombre.localeCompare(b.nombre));

  const sinContar = (d.sinContar ?? []).map((s) => ({ ...s, unidad: s.unidad ?? "", sistema: r3(s.sistema) }));
  return {
    numero: d.numero, empresa: d.empresa, departamento: d.departamento, fecha: d.fecha, conto: d.conto,
    abiertoEn: d.abiertoEn, cerradoEn: d.cerradoEn, lineas, eventos: d.eventos, sinContar,
    resumen: {
      renglones: lineas.length,
      coinciden: lineas.filter((l) => l.diferencia === 0).length,
      faltantes: lineas.filter((l) => l.diferencia !== null && l.diferencia < 0).length,
      sobrantes: lineas.filter((l) => l.diferencia !== null && l.diferencia > 0).length,
      nuevos: lineas.filter((l) => l.esNuevo).length,
      sinContar: sinContar.length,
    },
  };
}

/**
 * La misma acta con el valor en $ de cada diferencia: costo sin IVA al cierre
 * por la diferencia. Solo lleva los renglones que tienen diferencia, y los
 * articulos nuevos, que no tienen costo y no entran en el total.
 */
export function valorizar(acta: Acta, costos: Map<string, number>): ActaValorizada {
  const lineas = acta.lineas
    .filter((l) => l.esNuevo || (l.diferencia !== null && l.diferencia !== 0))
    .map((l) => {
      const costo = l.esNuevo ? null : costos.get(l.codigo) ?? null;
      return { ...l, costo, valor: costo === null || l.diferencia === null ? null : r2(l.diferencia * costo) };
    });
  const faltantes = r2(lineas.reduce((a, l) => a + (l.valor !== null && l.valor! < 0 ? l.valor! : 0), 0));
  const sobrantes = r2(lineas.reduce((a, l) => a + (l.valor !== null && l.valor! > 0 ? l.valor! : 0), 0));
  return {
    ...acta,
    lineas,
    valor: { faltantes, sobrantes, neto: r2(faltantes + sobrantes), sinCosto: lineas.filter((l) => l.costo === null).length },
  };
}

// ---------------------------------------------------------------- formato
/** 1.600 · 212,5 · −2,23. El signo menos es el tipografico, no el guion. */
export function fmtNum(n: number | null): string {
  if (n === null) return "—";
  const s = Math.abs(n).toLocaleString("es-VE", { maximumFractionDigits: 3 });
  return (n < 0 ? "−" : "") + s;
}

/** +2 · −1,9 · 0 · nuevo */
export function fmtDif(n: number | null): string {
  if (n === null) return "nuevo";
  if (n === 0) return "0";
  return (n > 0 ? "+" : "") + fmtNum(n);
}

/** −$241,47 · +$13,52 */
export function fmtUsdSigno(n: number | null): string {
  if (n === null) return "—";
  const s = Math.abs(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "−" : n > 0 ? "+" : "") + "$" + s;
}
