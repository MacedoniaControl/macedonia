// Qué movimientos deja una entrega, y qué la frena. Pura: se prueba sin base
// (entrega.test.ts) y la usa registrarEntrega.
//
//   · No se dejan más llenos de los que hay en planta: el saldo quedaría en
//     negativo y el parque dejaría de cuadrar con el galpón.
//   · Los vacíos que trae el técnico salen de lo que el cliente tiene en su
//     poder. Si trae más de lo registrado, el sobrante entra al parque como
//     alta: son cilindros que ya estaban en clientes antes de Macedonia (el
//     parque inicial del 02-09-2026 contó solo lo que había en planta).

export type LineaPlan = { gas: string; llenosEntregados: number; vaciosRecibidos: number };
export type MovPlan = { gas: string; cantidad: number; desde: "lleno" | "en_cliente" | null; hacia: "en_cliente" | "vacio"; nota?: string };

/** El cliente como se guarda: sin espacios de más y en mayúsculas. «Taguicho » y «TAGUICHO» son el mismo. */
export const normalizarCliente = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

export function planEntrega(
  lineas: LineaPlan[],
  llenosEnPlanta: Record<string, number>,
  enPoderDelCliente: Record<string, number>,
): { movimientos: MovPlan[]; errores: string[]; avisos: string[] } {
  const movimientos: MovPlan[] = [];
  const errores: string[] = [];
  const avisos: string[] = [];
  for (const l of lineas) {
    const llenos = Math.max(0, Math.floor(l.llenosEntregados));
    const vacios = Math.max(0, Math.floor(l.vaciosRecibidos));
    if (llenos > 0) {
      const hay = llenosEnPlanta[l.gas] ?? 0;
      if (llenos > hay) errores.push(`Solo hay ${hay} lleno(s) de ${l.gas} en planta y quieres dejar ${llenos}.`);
      else movimientos.push({ gas: l.gas, cantidad: llenos, desde: "lleno", hacia: "en_cliente" });
    }
    if (vacios > 0) {
      const tiene = Math.max(0, enPoderDelCliente[l.gas] ?? 0);
      const retorno = Math.min(vacios, tiene);
      const sobra = vacios - retorno;
      if (retorno > 0) movimientos.push({ gas: l.gas, cantidad: retorno, desde: "en_cliente", hacia: "vacio" });
      if (sobra > 0) {
        movimientos.push({
          gas: l.gas, cantidad: sobra, desde: null, hacia: "vacio",
          nota: "Retorno de cilindro(s) que no figuraban en poder del cliente: entran al parque.",
        });
        avisos.push(`${sobra} vacío(s) de ${l.gas} no figuraban en poder del cliente: entran al parque como alta.`);
      }
    }
  }
  return { movimientos, errores, avisos };
}
