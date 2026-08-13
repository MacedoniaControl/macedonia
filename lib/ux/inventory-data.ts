// Modelo de inventario Físico / S / Master. Ver docs/decisions/inventory-model.md
import seed from "./inventory-fisico-seed.json";

/** Item del Inventario Físico (export de Valery, read-only). */
export type FisicoItem = {
  codigo: string;
  nombre: string;
  undPpal: string;
  existPpal: number;
  undAlt: string;
  existAlt: number;
};

/** Item del Inventario S (stock propio de SumiControl). */
export type SItem = {
  codigo: string;
  nombre: string;
  existencia: number;
  costo: number;
  precio: number;
  empresa: string;
  almacen: string;
  /** OWNER/ADMIN aprobó que exista en ambos inventarios. */
  tagDuplicado?: boolean;
};

type Seed = { fuente: string; fecha: string; items: FisicoItem[] };
const SEED = seed as Seed;

/** Físico completo (demo: todo el export = Sumigases / Lechería). */
export const FISICO: FisicoItem[] = SEED.items;
export const FISICO_META = { fuente: SEED.fuente, fecha: SEED.fecha, empresa: "Sumigases", almacen: "Lechería" };

const fisicoByCode = new Map(FISICO.map((f) => [f.codigo, f]));
export function fisicoExistencia(codigo: string): number {
  return fisicoByCode.get(codigo)?.existPpal ?? 0;
}
export function inFisico(codigo: string): boolean {
  return fisicoByCode.has(codigo);
}

/** Fila del Master = Físico + S por código. */
export type MasterRow = {
  codigo: string;
  nombre: string;
  fisico: number;
  s: number;
  master: number;
  enFisico: boolean;
  enS: boolean;
  /** código presente en ambos inventarios (control de duplicidad). */
  duplicado: boolean;
  /** duplicado sin aprobar por OWNER/ADMIN → bloqueado. */
  bloqueado: boolean;
};

export function buildMaster(sItems: SItem[]): MasterRow[] {
  const sByCode = new Map(sItems.map((s) => [s.codigo, s]));
  const codes = new Set<string>([...fisicoByCode.keys(), ...sByCode.keys()]);
  const rows: MasterRow[] = [];
  for (const codigo of codes) {
    const f = fisicoByCode.get(codigo);
    const s = sByCode.get(codigo);
    const enFisico = !!f;
    const enS = !!s;
    const duplicado = enFisico && enS;
    const bloqueado = duplicado && !s?.tagDuplicado;
    rows.push({
      codigo,
      nombre: f?.nombre ?? s?.nombre ?? "",
      fisico: f?.existPpal ?? 0,
      s: s?.existencia ?? 0,
      master: (f?.existPpal ?? 0) + (s?.existencia ?? 0),
      enFisico,
      enS,
      duplicado,
      bloqueado,
    });
  }
  return rows.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Códigos en conflicto (duplicados sin aprobar). */
export function duplicadosBloqueados(sItems: SItem[]): SItem[] {
  return sItems.filter((s) => inFisico(s.codigo) && !s.tagDuplicado);
}
