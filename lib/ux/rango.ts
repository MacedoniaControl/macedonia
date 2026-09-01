// Rango de fechas y agrupación, compartido por Dashboard, Reportes, ROI y
// Matrices.
//
// Vive en un solo lugar porque las cuatro pantallas tienen que contestar la
// misma pregunta —"¿de cuándo a cuándo, y agrupado cómo?"— y si cada una lo
// resuelve por su cuenta terminan dando números distintos del mismo período.

export type Agrupacion = "semana" | "mes" | "anio";

export type Rango = {
  desde: string;          // ISO, aaaa-mm-dd
  hasta: string;
  agrupacion: Agrupacion;
};

/** Arranque de la operación. Antes de esto no hay nada que mostrar. */
export const INICIO_OPERACIONES = "2022-01-01";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const hoyISO = () => iso(new Date());

function atras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return iso(d);
}

/** Atajos. El de por defecto es el mes: es lo que se mira todos los días. */
export const PRESETS: { id: string; label: string; rango: () => Omit<Rango, "agrupacion"> }[] = [
  { id: "mes",     label: "Este mes",     rango: () => ({ desde: atras(30),  hasta: hoyISO() }) },
  { id: "tri",     label: "3 meses",      rango: () => ({ desde: atras(90),  hasta: hoyISO() }) },
  { id: "sem",     label: "6 meses",      rango: () => ({ desde: atras(182), hasta: hoyISO() }) },
  { id: "anio",    label: "12 meses",     rango: () => ({ desde: atras(365), hasta: hoyISO() }) },
  { id: "todo",    label: "Todo",         rango: () => ({ desde: INICIO_OPERACIONES, hasta: hoyISO() }) },
];

export const RANGO_POR_DEFECTO: Rango = {
  ...PRESETS[0].rango(),
  agrupacion: "mes",
};

/**
 * Arranque de las pantallas históricas (Reportes, ROI, Matrices).
 *
 * El histórico cierra el mes anterior, así que abrir en «este mes» las dejaba
 * vacías: se entra y no hay nada. Doce meses siempre tiene algo que mostrar.
 */
export const RANGO_HISTORICO: Rango = {
  ...PRESETS.find((p) => p.id === "anio")!.rango(),
  agrupacion: "mes",
};

/**
 * La clave del período al que cae una fecha, según la agrupación.
 * Se usa para juntar filas: todas las que devuelven la misma clave van juntas.
 */
export function claveDe(fechaISO: string, a: Agrupacion): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  if (a === "anio") return String(d.getFullYear());
  if (a === "mes") return fechaISO.slice(0, 7);

  // Semana ISO: la del jueves de esa semana, para no partir el año por la mitad.
  const j = new Date(d);
  j.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const primero = new Date(j.getFullYear(), 0, 4);
  const n = 1 + Math.round(((j.getTime() - primero.getTime()) / 86400000 - 3 + ((primero.getDay() + 6) % 7)) / 7);
  return `${j.getFullYear()}-S${String(n).padStart(2, "0")}`;
}

/** Cómo se muestra una clave de período. */
export function etiquetaDe(clave: string, a: Agrupacion): string {
  if (a === "anio") return clave;
  if (a === "semana") return clave.replace("-S", " · sem ");
  const [y, m] = clave.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${meses[Number(m) - 1]} ${y}`;
}

export function dentroDe(fechaISO: string, r: Rango): boolean {
  return fechaISO >= r.desde && fechaISO <= r.hasta;
}

/** Agrupa filas con fecha en períodos, respetando el rango. */
export function agrupar<T>(
  filas: T[],
  fecha: (f: T) => string,
  r: Rango,
): { clave: string; etiqueta: string; filas: T[] }[] {
  const cajas = new Map<string, T[]>();
  for (const f of filas) {
    const d = fecha(f);
    if (!dentroDe(d, r)) continue;
    const k = claveDe(d, r.agrupacion);
    (cajas.get(k) ?? cajas.set(k, []).get(k)!).push(f);
  }
  return [...cajas.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, filas]) => ({ clave, etiqueta: etiquetaDe(clave, r.agrupacion), filas }));
}
