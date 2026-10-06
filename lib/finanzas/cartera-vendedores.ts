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
