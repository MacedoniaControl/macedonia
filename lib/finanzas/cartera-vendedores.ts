// Las dos carteras de Cuentas por Cobrar: la propia y la de vendedores externos.
//
// Cada cuenta trae su vendedor (null = propia); la base decide cuál al crearla
// (migración 36). Aquí solo se filtra y se resume, igual para la pantalla y la
// descarga (cartera-vendedores.test.ts).

export type FiltroCartera = "todas" | "propia" | "externos";
type ConVendedor = { vendedorExterno: string | null };
type ConSaldo = ConVendedor & { saldo: number; dias: number };

/** ¿La cuenta entra en la cartera elegida? Con un vendedor, solo las suyas. */
export function enCartera(c: ConVendedor, filtro: FiltroCartera, vendedor = ""): boolean {
  if (filtro === "propia") return !c.vendedorExterno;
  if (filtro === "externos") return !!c.vendedorExterno && (!vendedor || c.vendedorExterno === vendedor);
  return true;
}

/** Las cuatro cifras del Resumen de Cartera: lo mismo que mostraban las tarjetas. */
export function resumenCartera(cs: ConSaldo[]) {
  const abiertas = cs.filter((c) => c.saldo > 0);
  return {
    total: cs.reduce((a, c) => a + c.saldo, 0),
    vencido: abiertas.filter((c) => c.dias < 0).reduce((a, c) => a + c.saldo, 0),
    porVencer: abiertas.filter((c) => c.dias >= 0 && c.dias <= 8).reduce((a, c) => a + c.saldo, 0),
    vencidas: abiertas.filter((c) => c.dias < 0).length,
  };
}

export type ResumenDeCartera = {
  /** "propia" o el nombre del vendedor externo. */
  id: string;
  nombre: string;
  externa: boolean;
  resumen: ReturnType<typeof resumenCartera>;
  cuentas: number;
  clientes: number;
  /** Parte del total por cobrar, en %. */
  parte: number;
};

/**
 * Cada cartera por separado, para el Resumen: primero la propia, después cada
 * vendedor externo de mayor a menor deuda. Las partes suman 100 %.
 */
export function porCartera<C extends ConSaldo & { contraparte: string }>(cs: C[], nombrePropia: string): ResumenDeCartera[] {
  const grupos = new Map<string, C[]>();
  for (const c of cs) {
    const k = c.vendedorExterno?.trim() || "";
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  const total = cs.reduce((a, c) => a + c.saldo, 0);
  const filas = [...grupos.entries()].map(([k, g]) => ({
    id: k || "propia", nombre: k || nombrePropia, externa: !!k,
    resumen: resumenCartera(g), cuentas: g.length,
    clientes: new Set(g.map((c) => claveCliente(c.contraparte))).size,
    parte: total ? Math.round((g.reduce((a, c) => a + c.saldo, 0) / total) * 1000) / 10 : 0,
  }));
  return filas.sort((a, b) => Number(a.externa) - Number(b.externa) || b.resumen.total - a.resumen.total);
}

/** Los vendedores externos que aparecen: en las cuentas y en los clientes asignados. */
export function vendedoresEnCartera(cs: ConVendedor[], asignados: { vendedor: string }[] = []): string[] {
  const m = new Map<string, string>();
  for (const n of [...cs.map((c) => c.vendedorExterno), ...asignados.map((a) => a.vendedor)]) {
    const v = (n ?? "").trim();
    if (v && !m.has(v.toUpperCase())) m.set(v.toUpperCase(), v);
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** El mismo cliente escrito con espacios o mayúsculas distintas (la regla de la base). */
export const claveCliente = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
