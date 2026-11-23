// Qué tasa BCV vale hoy, entre las que ya publicó el BCV (tasas_bcv).
//
// El BCV publica en la tarde la tasa del siguiente día hábil («fecha valor»).
// Lo normal: vale la última con fecha valor ≤ hoy; la del día siguiente, ya
// publicada, se muestra aparte («próxima»).
//
// Pedido del usuario (23-11-2026): el viernes 20-11 el BCV publicó 919,8227 con
// fecha valor MARTES 24-11 (se saltó el lunes 23: no fue día hábil para el BCV).
// Macedonia se quedó en la del 20-11, pero la empresa ese lunes facturó en
// Valery con 919,82 (55 renglones; el sábado 21 había usado la del 20-11).
// Así trabaja la empresa, y así queda:
//   · un día de semana (lunes a viernes) SIN fecha valor propia, en que ya está
//     publicada desde antes la del siguiente día hábil, usa esa;
//   · el sábado y el domingo siguen con la última con fecha valor ≤ hoy.
//
// Pura, para probarla.

export type FilaTasa = { fecha_valor: string; tasa: number; primera_vez?: string | null; ultima_vez: string };

const diaCaracas = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date(iso));
/** 0 = domingo … 6 = sábado, de una fecha YYYY-MM-DD. */
const diaSemana = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

export type Eleccion<F extends FilaTasa> = {
  vigente: F;
  /** La ya publicada para un día que viene (null si no hay, o si ya es la vigente). */
  proxima: F | null;
  /** Hoy no tuvo fecha valor propia (día no hábil del BCV): vale la del siguiente día hábil. */
  adelantada: boolean;
};

export function elegirVigente<F extends FilaTasa>(filas: F[], hoy: string): Eleccion<F> | null {
  if (!filas.length) return null;
  const orden = [...filas].sort((a, b) => b.fecha_valor.localeCompare(a.fecha_valor));
  const normal = orden.find((f) => f.fecha_valor <= hoy) ?? orden[orden.length - 1];
  // La primera publicada para después de hoy (la del siguiente día hábil).
  const siguiente = [...orden].reverse().find((f) => f.fecha_valor > hoy) ?? null;
  const dia = diaSemana(hoy);
  const habil = dia >= 1 && dia <= 5;
  const publicadaAntes = !!siguiente && !!(siguiente.primera_vez ?? siguiente.ultima_vez)
    && diaCaracas(String(siguiente.primera_vez ?? siguiente.ultima_vez)) < hoy;
  const adelantada = habil && normal.fecha_valor !== hoy && !!siguiente && publicadaAntes;
  const vigente = adelantada ? siguiente! : normal;
  return { vigente, proxima: orden[0].fecha_valor > vigente.fecha_valor ? orden[0] : null, adelantada };
}
