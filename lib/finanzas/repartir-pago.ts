// Repartir un pago entre las notas de un cliente (o proveedor).
//
// Pedido del usuario (07-10-2026): «si en una deuda de 500 tengo 5 notas de
// 100 y abono 350, debe liquidarme 3 notas y abonar 50 en otra, y quedar
// restante 150». El sistema hace la cuenta y propone; la persona elige:
//
//   · Se saldan completas las notas que alcanza el pago, de la más vieja a la
//     más nueva, hasta la primera que ya no cabe.
//   · Lo que sobra se abona a la nota de MAYOR saldo pendiente de las que no
//     se saldan (se puede elegir otra). Ese abono va en la misma liquidación.
//   · El restante tiene que ser menor que el saldo de la nota que lo recibe: si
//     alcanza para saldarla, esa nota se marca para saldar.
//
// Pura, para probarla y para que la pantalla y la base cuenten igual.

import { aMonto, CASI_CERO } from "../ux/decimales.ts";

export type NotaPago = { id: number; documento: string; vence: string; pendiente: number };

const porAntiguedad = (a: NotaPago, b: NotaPago) => a.vence.localeCompare(b.vence) || a.documento.localeCompare(b.documento);

/** La nota de mayor saldo de las que pueden recibir `restante` (desempate: la más vieja). */
function mayorSaldo(notas: NotaPago[], restante: number): number | null {
  const ok = notas.filter((n) => n.pendiente > restante + CASI_CERO).sort((a, b) => b.pendiente - a.pendiente || porAntiguedad(a, b));
  return ok[0]?.id ?? null;
}

/**
 * La propuesta para un pago de `monto`: qué notas se saldan y a cuál va el
 * restante. `primero`: notas que van antes que las demás (la que se estaba
 * viendo al registrar el pago).
 */
export function repartoInicial(notas: NotaPago[], monto: number, primero: number[] = []): { saldadas: number[]; restante: number; destino: number | null } {
  const saldadas: number[] = [];
  let queda = aMonto(monto);
  const orden = [...notas].sort((a, b) => {
    const pa = primero.indexOf(a.id), pb = primero.indexOf(b.id);
    if (pa !== pb) return (pa < 0 ? Infinity : pa) - (pb < 0 ? Infinity : pb);
    return porAntiguedad(a, b);
  });
  for (const n of orden) {
    if (n.pendiente > queda + CASI_CERO) break;
    saldadas.push(n.id);
    queda = aMonto(queda - n.pendiente);
  }
  const restante = queda > CASI_CERO ? queda : 0;
  const libres = notas.filter((n) => !saldadas.includes(n.id));
  return { saldadas, restante, destino: restante ? mayorSaldo(libres, restante) : null };
}

export type Reparto = {
  /** Lo que suman las notas marcadas para saldar. */
  suma: number;
  /** Lo que sobra del pago y se abona a otra nota (0 si no sobra). */
  restante: number;
  /** A qué nota va el restante (null si no sobra). */
  destino: number | null;
  /** Las notas que pueden recibir el restante. */
  destinos: number[];
  /** Lo que queda debiendo el cliente después del pago. */
  quedaDebiendo: number;
  error: string | null;
};

/**
 * Cómo queda un pago de `monto` con las notas `saldadas` marcadas y el
 * restante a `destinoElegido` (si no sirve, a la de mayor saldo).
 */
export function evaluarReparto(notas: NotaPago[], monto: number, saldadas: Set<number>, destinoElegido: number | null, fmt: (n: number) => string): Reparto {
  const marcadas = notas.filter((n) => saldadas.has(n.id));
  const libres = notas.filter((n) => !saldadas.has(n.id));
  const suma = aMonto(marcadas.reduce((a, n) => a + n.pendiente, 0));
  const deuda = aMonto(notas.reduce((a, n) => a + n.pendiente, 0));
  const pago = aMonto(monto);
  const base = { suma, restante: 0, destino: null, destinos: [] as number[], quedaDebiendo: aMonto(deuda - Math.min(pago, deuda)) };
  if (pago > deuda + CASI_CERO) return { ...base, error: `El pago (${fmt(pago)}) es mayor que lo que se debe (${fmt(deuda)}).` };
  if (suma > pago + CASI_CERO) return { ...base, error: `Las notas marcadas suman ${fmt(suma)}, más que el pago (${fmt(pago)}). Desmarca alguna.` };
  if (!marcadas.length) return { ...base, error: "Con ese pago no se salda ninguna nota. Marca al menos una, o regístralo como abono." };
  const restante = aMonto(pago - suma);
  if (restante <= CASI_CERO) return { ...base, error: null };
  const destinos = libres.filter((n) => n.pendiente > restante + CASI_CERO).sort((a, b) => b.pendiente - a.pendiente || porAntiguedad(a, b)).map((n) => n.id);
  if (!destinos.length) {
    return { ...base, restante, error: `Sobran ${fmt(restante)} y alcanzan para saldar otra nota: márcala.` };
  }
  const destino = destinoElegido !== null && destinos.includes(destinoElegido) ? destinoElegido : destinos[0];
  return { ...base, restante, destino, destinos, error: null };
}
