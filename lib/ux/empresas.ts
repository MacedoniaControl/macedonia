// Registro de empresas — fuente única de identidad (nombre, RIF, logo, tema).
// Lo consumen: dashboards por empresa, documentos (notas/cotizaciones) y el selector.
// El tema real (colores de marca) se aplica con la clase CSS `theme-<id>` (ver globals.css).
import { SUMIGASES_LOGO } from "./sumigases-logo";
import { SUDEMATIN_LOGO } from "./sudematin-logo";

export type EmpresaId = "sumigases" | "sudematin";

export type Empresa = {
  id: EmpresaId;
  nombre: string;
  nombreCorto: string;
  rif: string;
  direccion: string;
  logo: string; // data URI
  /** Color de marca (para chips/acentos inline; el tema global va por clase CSS). */
  color: string;
  /** Dirección tal como aparece impresa en los documentos de Valery (mayúsculas, sin puntuación). */
  direccionImpresa: string;
  /** Línea de rubros del encabezado impreso. Vacío = no se imprime (no inventar). */
  rubros: string;
  /** Bloque secundario del encabezado (la otra empresa del grupo). Vacío = no se imprime. */
  subBloque: string;
};

export const EMPRESAS: Record<EmpresaId, Empresa> = {
  sumigases: {
    id: "sumigases",
    nombre: "Sumigases Oriente, C.A.",
    nombreCorto: "Sumigases",
    rif: "J-502789510",
    direccion: "Av. Bolívar, Lechería, Anzoátegui",
    logo: SUMIGASES_LOGO,
    color: "#b04e15", // naranja
    direccionImpresa: "AV BOLIVAR LOCAL NRO SN SECTOR BELLA VISTA PUERTO LA CRUZ ANZOATEGUI",
    rubros: "ELECTRODOS - GASES INDUSTRIALES/MEDICINALES - ROLINERAS - CORREAS - CADENAS ACOPLES - POLEAS",
    subBloque:
      "AV MIRANDA, EDIF SUDEMATIN, PISO 1 URB PARCELAMIENTO MIRANDA, SECTOR LA COPITA CUMANA · J316971414",
  },
  sudematin: {
    id: "sudematin",
    nombre: "Sudematin & GM, C.A.",
    nombreCorto: "Sudematin",
    rif: "J-31697141-4",
    direccion: "Cumaná, Sucre",
    logo: SUDEMATIN_LOGO,
    color: "#2a2a8c", // azul índigo del logo
    direccionImpresa:
      "AV MIRANDA, EDIF SUDEMATIN, PISO 1 URB PARCELAMIENTO MIRANDA, SECTOR LA COPITA CUMANA",
    // Sin dato confirmado del formato impreso de Sudematin: se deja vacío a propósito
    // para no imprimir texto inventado en un documento que va al cliente.
    rubros: "",
    subBloque: "",
  },
};

export const EMPRESA_IDS: EmpresaId[] = ["sumigases", "sudematin"];

export function isEmpresaId(x: string): x is EmpresaId {
  return x === "sumigases" || x === "sudematin";
}

export function getEmpresa(id: string): Empresa | null {
  return isEmpresaId(id) ? EMPRESAS[id] : null;
}
