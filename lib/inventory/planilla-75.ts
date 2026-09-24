// La planilla impresa de 75 productos de Sumigases, en el orden del papel.
//
// Es la hoja que se imprimio para el primer conteo: los 75 productos con mas
// movimiento. El N° de cada renglon es su posicion aquí, para que quien pasa el
// papel a la pantalla encuentre el mismo numero en los dos lados. El renglon
// 54 era 010203 (un servicio, no se cuenta): se reemplazo por el siguiente con
// mas movimiento, 10N24, sin correr la numeracion.

export const ZONA_PLANILLA_75 = "Planilla impresa de 75 productos";

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
