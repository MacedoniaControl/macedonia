// Puente Valery: qué agente sirve a qué empresa (agente 1.0.9).
//
// Pedido del usuario (18-11-2026), tras un incidente: el instalador de
// Sumigases se ejecutó en el servidor de Valery de Sudematin (equipo RAUL). El
// agente pasó su prueba con la clave de Sumigases, Macedonia lo estrenó y ese
// mismo instante anuló al de Sumigases (SERVIDORSUD). Se desconectó a mano antes
// de que entregara nada, pero la próxima venta automática habría metido las
// ventas de Sudematin dentro de Sumigases: la pared entre empresas (regla 3).
//
// El RIF de la base NO sirve para saber de quién es: la base de Sumigases tiene
// en su tabla EMPRESA el RIF de Sudematin (licencia «DEMOSTRACION, C.A.»).
// Por eso la base se reconoce por DÓNDE está: el equipo y la ruta del archivo.
//
// Reglas, de la más fuerte a la más suave:
//   1. Si esa misma base ya la lee el agente activo de OTRA empresa, se
//      rechaza: el instalador falla y no cambia nada.
//   2. Si es la misma base del agente activo de su empresa (reinstalar o
//      actualizar en el mismo servidor), se estrena solo, como hasta ahora.
//   3. Cualquier otro caso (primera instalación, otro equipo u otra ruta) queda
//      esperando a que el Owner o un Administrador de ESA empresa lo apruebe en
//      el panel, viendo el equipo y la base. Hasta entonces no recibe pedidos y
//      el agente de antes sigue funcionando.
//
// Pura, para probarla.

/** La base que lee un agente: «EQUIPO|ruta», o null si no la dijo. */
export function huellaBase(info: unknown): string | null {
  const i = (info && typeof info === "object" ? info : {}) as Record<string, unknown>;
  const equipo = String(i.equipo ?? "").trim().toUpperCase();
  const base = String(i.base ?? "").trim().replace(/\//g, "\\").toLowerCase();
  return equipo && base ? `${equipo}|${base}` : null;
}

export type Estreno =
  | { decision: "estrenar" }
  | { decision: "aprobar" }
  | { decision: "rechazar"; empresa: string };

/**
 * ¿Qué se hace con un agente recién instalado («en espera») que se conecta?
 * `activo`: la info del agente activo de su empresa (o null).
 * `otras`: los agentes ACTIVOS de las otras empresas. Los revocados no cuentan:
 * uno revocado pudo ser justo el instalado en la empresa equivocada.
 */
export function decidirEstreno(nuevo: unknown, activo: unknown | null, otras: { empresa: string; info: unknown }[]): Estreno {
  const h = huellaBase(nuevo);
  if (h) {
    const ajena = otras.find((o) => huellaBase(o.info) === h);
    if (ajena) return { decision: "rechazar", empresa: ajena.empresa };
  }
  if (h && activo !== null && huellaBase(activo) === h) return { decision: "estrenar" };
  return { decision: "aprobar" };
}

/** Cada cuánto vuelve a preguntar el agente, en segundos. */
export const ESPERA_QUIETO = 10;
export const ESPERA_ACTIVO = 2;
/** Tras un pedido, el agente pregunta seguido durante este rato: suelen venir varios juntos. */
export const VENTANA_ACTIVA_MS = 3 * 60_000;

/**
 * Cuánto espera el agente antes de volver a preguntar. Si hubo un pedido hace
 * poco (creado o terminado), seguido; si no, a paso normal.
 */
export function esperaDelAgente(ultimoMovimiento: string | null | undefined, ahora = Date.now()): number {
  if (!ultimoMovimiento) return ESPERA_QUIETO;
  const t = Date.parse(ultimoMovimiento);
  return Number.isFinite(t) && ahora - t < VENTANA_ACTIVA_MS ? ESPERA_ACTIVO : ESPERA_QUIETO;
}
