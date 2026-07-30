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
  },
  sudematin: {
    id: "sudematin",
    nombre: "Sudematin & GM, C.A.",
    nombreCorto: "Sudematin",
    rif: "J-31697141-4",
    direccion: "Cumaná, Sucre",
    logo: SUDEMATIN_LOGO,
    color: "#2a2a8c", // azul índigo del logo
  },
};

export const EMPRESA_IDS: EmpresaId[] = ["sumigases", "sudematin"];

export function isEmpresaId(x: string): x is EmpresaId {
  return x === "sumigases" || x === "sudematin";
}

export function getEmpresa(id: string): Empresa | null {
  return isEmpresaId(id) ? EMPRESAS[id] : null;
}
