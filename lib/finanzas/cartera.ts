// La cartera agrupada por cliente: cuánto debe cada uno, con sus documentos
// adentro. Con cientos de notas de entrega por cliente, la lista plana no
// dejaba ver lo que importa: a quién se le cobra y cuánto.
//
// Pura, para que la pantalla y la descarga sumen lo mismo (cartera.test.ts).

export type CuentaCartera = {
  id: number;
  contraparte: string;
  clase: string;
  monto: number;
  abonado: number;
  saldo: number;
  vence: string;
  /** Días hasta el vencimiento. Negativo = vencida. */
  dias: number;
  estado: string;
};

export type ClienteCartera<C extends CuentaCartera = CuentaCartera> = {
  cliente: string;
  cuentas: C[];
  documentos: number;
  porClase: Record<string, number>;
  monto: number;
  abonado: number;
  saldo: number;
  vencido: number;
  /** La deuda más vieja que sigue abierta: su vencimiento y sus días de atraso. */
  masVieja: { vence: string; dias: number } | null;
};

/** El mismo cliente escrito con espacios o mayúsculas distintas es el mismo cliente. */
const clave = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

export function agruparPorCliente<C extends CuentaCartera>(cuentas: C[]): ClienteCartera<C>[] {
  const cajas = new Map<string, C[]>();
  for (const c of cuentas) {
    const k = clave(c.contraparte);
    const caja = cajas.get(k) ?? [];
    caja.push(c);
    cajas.set(k, caja);
  }
  return [...cajas.values()]
    .map((cs) => {
      // Dentro del cliente, por vencimiento: primero lo más viejo.
      const orden = [...cs].sort((a, b) => a.vence.localeCompare(b.vence));
      const abiertas = orden.filter((c) => c.estado !== "liquidada" && c.saldo > 0);
      const porClase: Record<string, number> = {};
      for (const c of cs) porClase[c.clase] = (porClase[c.clase] ?? 0) + 1;
      return {
        cliente: cs[0].contraparte.trim(),
        cuentas: orden,
        documentos: cs.length,
        porClase,
        monto: cs.reduce((a, c) => a + c.monto, 0),
        abonado: cs.reduce((a, c) => a + c.abonado, 0),
        saldo: cs.reduce((a, c) => a + c.saldo, 0),
        vencido: abiertas.filter((c) => c.dias < 0).reduce((a, c) => a + c.saldo, 0),
        masVieja: abiertas.length ? { vence: abiertas[0].vence, dias: abiertas[0].dias } : null,
      };
    })
    // Primero quien más debe; a igual saldo, por nombre.
    .sort((a, b) => b.saldo - a.saldo || a.cliente.localeCompare(b.cliente, "es"));
}
