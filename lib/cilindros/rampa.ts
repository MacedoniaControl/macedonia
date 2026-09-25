// Conteo de la Rampa: el técnico escribe lo que VE en el galpón y el sistema
// calcula la diferencia con lo registrado. Nadie tiene que sumar ni restar a
// mano, que es donde se equivocaba el ajuste de «agregar/quitar N».
//
// Contar no ajusta: el conteo queda pendiente y el parque cambia cuando el
// Owner o un Administrador lo aprueba (registrar/aprobar_conteo_cilindros en
// la migración 27, que también valida todo esto otra vez).
//
// Solo se cuentan llenos y vacíos: es lo que está físicamente en la planta.
// Los que están en un cliente o en llenado no se ven, y fuera de servicio se
// mueve con «Cambiar Estado», que exige el motivo del daño.

export type EstadoRampa = "lleno" | "vacio";
export const ESTADOS_RAMPA: EstadoRampa[] = ["lleno", "vacio"];
export const ETIQUETA_RAMPA: Record<EstadoRampa, string> = { lleno: "Llenos", vacio: "Vacíos" };

/** Así empieza la nota de cada movimiento de un conteo aprobado: el historial lo reconoce por esto. */
export const NOTA_CONTEO_RAMPA = "Conteo de rampa";

/** Lo contado por gas, junto con lo que el sistema mostraba al empezar. */
export type LineaConteoRampa = {
  gas: string;
  contado: Record<EstadoRampa, number>;
  visto: Record<EstadoRampa, number>;
};

export type RenglonConteo = { gas: string; estado: EstadoRampa; sistema: number; contado: number };
export type Diferencia = RenglonConteo & { diferencia: number };

/** Solo los renglones que no cuadran, con su signo: sobrante (+) o faltante (−). */
export function diferencias(renglones: RenglonConteo[]): Diferencia[] {
  return renglones.filter((r) => r.contado !== r.sistema).map((r) => ({ ...r, diferencia: r.contado - r.sistema }));
}

/** Del formulario (por gas) a renglones (gas × estado), en el orden en que se muestran. */
export function renglonesDe(lineas: LineaConteoRampa[]): RenglonConteo[] {
  return lineas.flatMap((l) => ESTADOS_RAMPA.map((e) => ({ gas: l.gas, estado: e, sistema: l.visto[e] ?? 0, contado: l.contado[e] ?? 0 })));
}

/** Lo que manda la pantalla a registrar_conteo_cilindros. */
export function cargaConteo(lineas: LineaConteoRampa[]) {
  return lineas.map((l) => ({ gas: l.gas, lleno: l.contado.lleno, vacio: l.contado.vacio, visto_lleno: l.visto.lleno, visto_vacio: l.visto.vacio }));
}

/** Saldo que deja aprobar el conteo, con lo que hay HOY: aplica la diferencia vista al contar. */
export function saldoAlAprobar(hoy: number, d: Pick<Diferencia, "diferencia">): number {
  return hoy + d.diferencia;
}

export const conSigno = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** Texto que acompaña al campo de cantidad: se permite vacío mientras se escribe. */
export function leerCantidad(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}
