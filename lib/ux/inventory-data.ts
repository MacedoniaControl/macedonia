// Modelo de inventario Físico / S / Master. Ver docs/decisions/inventory-model.md
//
// El inventario físico es POR EMPRESA: cada una tiene su propio export de Valery.
// Sumigases usa su export real; Sudematin arranca vacío hasta que se cargue el suyo.
// Nunca mezclar: un catálogo compartido haría que una empresa vea productos de la otra.
import seedSumigases from "./inventory-fisico-seed.json";

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

type Seed = { fuente: string; fecha: string; items: FisicoItem[]; almacen: string };

/** Export de Valery por empresa. Sudematin queda vacío hasta que se cargue su export. */
const SEEDS: Record<string, Seed> = {
  sumigases: { ...(seedSumigases as Omit<Seed, "almacen">), almacen: "Lechería" },
  sudematin: { fuente: "sin cargar", fecha: "—", items: [], almacen: "Cumaná" },
};

const seedDe = (empresa: string): Seed => SEEDS[empresa] ?? SEEDS.sumigases;

/** Físico de una empresa (solo lectura, viene del export de Valery). */
export function fisicoDe(empresa: string): FisicoItem[] {
  return seedDe(empresa).items;
}

export function fisicoMeta(empresa: string) {
  const s = seedDe(empresa);
  return { fuente: s.fuente, fecha: s.fecha, almacen: s.almacen, cargado: s.items.length > 0 };
}

/** Índice por código, cacheado por empresa. */
const indices = new Map<string, Map<string, FisicoItem>>();
function indiceDe(empresa: string): Map<string, FisicoItem> {
  let i = indices.get(empresa);
  if (!i) {
    i = new Map(fisicoDe(empresa).map((f) => [f.codigo, f]));
    indices.set(empresa, i);
  }
  return i;
}

export function fisicoExistencia(codigo: string, empresa: string): number {
  return indiceDe(empresa).get(codigo)?.existPpal ?? 0;
}
export function inFisico(codigo: string, empresa: string): boolean {
  return indiceDe(empresa).has(codigo);
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

export function buildMaster(sItems: SItem[], empresa: string): MasterRow[] {
  const fisicoByCode = indiceDe(empresa);
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
export function duplicadosBloqueados(sItems: SItem[], empresa: string): SItem[] {
  return sItems.filter((s) => inFisico(s.codigo, empresa) && !s.tagDuplicado);
}
