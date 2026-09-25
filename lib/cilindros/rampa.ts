// Conteo de la Rampa: el técnico escribe lo que VE en el galpón y el sistema
// calcula la diferencia con lo registrado. Nadie tiene que sumar ni restar a
// mano, que es donde se equivocaba el ajuste de «agregar/quitar N».
//
// Solo se cuentan llenos y vacíos: es lo que está físicamente en la planta.
// Los que están en un cliente o en llenado no se ven, y fuera de servicio se
// mueve con «Cambiar Estado», que exige el motivo del daño.

export type EstadoRampa = "lleno" | "vacio";
export const ESTADOS_RAMPA: EstadoRampa[] = ["lleno", "vacio"];

/** Así empieza la nota de cada ajuste: el historial lo reconoce por esto. */
export const NOTA_CONTEO_RAMPA = "Conteo de rampa";

/** Lo contado por gas, junto con lo que el sistema mostraba al empezar. */
export type LineaConteoRampa = {
  gas: string;
  contado: Record<EstadoRampa, number>;
  visto: Record<EstadoRampa, number>;
};

export type AjusteRampa = { gas: string; estado: EstadoRampa; antes: number; ahora: number; diferencia: number };

type Saldos = Record<EstadoRampa, Record<string, number>>;

const entero = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;

/**
 * Compara lo contado con el saldo actual y devuelve un ajuste por cada número
 * que cambia. Si la Rampa se movió mientras se contaba (una entrega, un
 * llenado), no adivina: pide volver a mirar, porque lo contado ya no se
 * compara contra lo que la persona tenía en pantalla.
 */
export function planConteoRampa(
  lineas: LineaConteoRampa[],
  actual: Saldos,
  gasesValidos: string[],
): { ok: true; ajustes: AjusteRampa[] } | { ok: false; error: string } {
  const validos = new Set(gasesValidos);
  const vistos = new Set<string>();
  const ajustes: AjusteRampa[] = [];
  for (const l of lineas) {
    if (!validos.has(l.gas)) return { ok: false, error: `El gas ${l.gas} no está activo en esta empresa.` };
    if (vistos.has(l.gas)) return { ok: false, error: `${l.gas} aparece dos veces en el conteo.` };
    vistos.add(l.gas);
    for (const e of ESTADOS_RAMPA) {
      const ahora = l.contado[e];
      if (!entero(ahora)) return { ok: false, error: `Revisa ${l.gas}: la cantidad tiene que ser un número entero, cero o más.` };
      const antes = actual[e][l.gas] ?? 0;
      if ((l.visto[e] ?? 0) !== antes) {
        return { ok: false, error: "La Rampa cambió mientras contabas (alguien registró un movimiento). Revisa los números y guarda otra vez." };
      }
      if (ahora !== antes) ajustes.push({ gas: l.gas, estado: e, antes, ahora, diferencia: ahora - antes });
    }
  }
  return { ok: true, ajustes };
}

/** Un ajuste hecho movimiento: sobrantes entran al parque, faltantes salen. */
export function movimientoDeAjuste(a: AjusteRampa): { gas: string; cantidad: number; desde: EstadoRampa | null; hacia: EstadoRampa | null } {
  return a.diferencia > 0
    ? { gas: a.gas, cantidad: a.diferencia, desde: null, hacia: a.estado }
    : { gas: a.gas, cantidad: -a.diferencia, desde: a.estado, hacia: null };
}

/** Texto que acompaña al campo de cantidad: se permite vacío mientras se escribe. */
export function leerCantidad(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}
