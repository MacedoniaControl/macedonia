// Los 75 de mayor rotación de cada empresa: los 75 productos con más movimiento,
// de todos los departamentos.
//
// Sumigases: en el orden del papel. Es la hoja que se imprimio para el primer conteo: los 75 productos con mas
// movimiento. El N° de cada renglon es su posicion aquí, para que quien pasa el
// papel a la pantalla encuentre el mismo numero en los dos lados. El renglon
// 54 era 010203 (un servicio, no se cuenta): se reemplazo por el siguiente con
// mas movimiento, 10N24, sin correr la numeracion.

// Así se llama la opción y así queda el conteo (abarca todos los departamentos).
export const ZONA_PLANILLA_75 = "Los 75 de Mayor Rotación";
/** El nombre con que se guardaban antes estos conteos. */
const ZONA_PLANILLA_75_ANTES = "Planilla impresa de 75 productos";
/** ¿Es un conteo de los 75 de mayor rotación? (también los guardados con el nombre viejo) */
export const esZona75 = (zona: string | null | undefined) => zona === ZONA_PLANILLA_75 || zona === ZONA_PLANILLA_75_ANTES;
/** Cómo se muestra la zona de un conteo: los viejos salen con el nombre nuevo. */
export const zonaVisible = (zona: string | null | undefined) => (esZona75(zona) ? ZONA_PLANILLA_75 : zona ?? null);

export const PLANILLA_75: readonly string[] = [
  "2702PD-500", "0316001", "OXI6", "E701018HF", "8004005", "8004004",
  "2001914", "E601018HF", "2002305", "E6010532HF", "6107062", "2001912",
  "6107061", "EL8010316", "8004202", "031600", "8145P95", "EALF7010532",
  "8004220", "8004002", "DIS-725", "25258", "8004020", "4009MPR",
  "ARG6", "E60105/32L", "E7018532L", "DC4332", "DE414", "E30918",
  "2001705", "E7018316", "8004021", "E601318H", "40001270", "LSAO",
  "THG85.8", "102R", "2002225", "00001601", "8003500", "TAC2231151",
  "TAP-708G", "8004503", "E701818L", "E6013332H", "8003520", "LSAC",
  "2002115", "4X6AT", "TAC2211152", "DF480", "ELHC18", "10N24",
  "DCKTX364", "40001058", "5001270", "6005301", "2002300", "E601018L",
  "TH01TX", "8210", "EHF70183332", "DIS-720", "BRGXL", "2002240",
  "EH7018532", "NITR6", "LPN80", "E6010532", "E601118H", "E701832L",
  "8004221", "6009932", "386912",
];

// Sudematin: los 75 productos de más movimiento en sus ventas de Valery del
// último año (sep-2025 a ago-2026, por cantidad de facturas y notas), sin
// servicios. Mismo criterio que la de Sumigases.
export const PLANILLA_75_SUDEMATIN: readonly string[] = [
  "OXI6", "E6013332H", "VA404318", "8004004", "OXITE", "TH01TX",
  "TEF03", "E308332", "6003901", "2007001", "00001601", "E6010532",
  "E701018HF", "E601318H", "E701818", "2001705", "C033", "386953",
  "C022", "ADA002", "3052093", "EA60", "ADA001", "TEI01",
  "2702PD-501", "ABRA06", "00001801", "E4043332", "RAMP38", "A002",
  "2002300", "NITR6", "252516", "MCON1036", "ADA003", "2002225",
  "2002305", "BOM75", "2007002", "OXI6MED", "2007000", "OXI80",
  "JUNT02", "LG80NOR", "E6010532HF", "KOB1450B", "AF15", "9041630",
  "ENC3151", "LENOX24", "TEI02", "KOB1480", "JUNT01", "A001",
  "ARG6", "PAGA19", "L2444", "9041632", "RAMP516", "2375227",
  "ER53563/64", "386912", "CPPAB22", "TOM270TB", "E30818", "113003525",
  "TEF02", "ABRA12", "CP34", "CG1304", "DF440", "E6013332",
  "212010112", "GAL002", "TOM270B",
];

/** La planilla de cada empresa (vacía si una empresa no tiene). */
export function planilla75(empresa: string): readonly string[] {
  return empresa === "sudematin" ? PLANILLA_75_SUDEMATIN : empresa === "sumigases" ? PLANILLA_75 : [];
}
