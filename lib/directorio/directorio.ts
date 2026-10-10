// El Directorio: las fichas de clientes y proveedores junto con su cartera.
//
// Cada contacto sale de su FICHA (lo que se llenó en el Directorio) o, si no
// tiene, de la CARTERA (un nombre que aparece en Cuentas por Cobrar o por
// Pagar). Los que no tienen ficha se marcan: sin ficha, el estado de cuenta en
// PDF sale sin RIF ni dirección, y el Directorio permite crearla con el nombre
// tal como está en la cartera (así se encuentran solas).
//
// Pura, para probarla: la pantalla le pasa las fichas y las cuentas ya leídas.

export type RolDirectorio = "cliente" | "proveedor";

/** Lo mínimo de una cuenta (por pagar: monto y saldo NETOS de la retención). */
export type CuentaDirectorio = {
  id: number; contraparte: string; documento: string; clase: string;
  monto: number; abonado: number; saldo: number; emitida: string; vence: string; dias: number; estado: string;
};

export type ResumenContacto = {
  /** Cuántos documentos tiene en la cartera, y cuántos siguen abiertos. */
  documentos: number; abiertos: number;
  /** Lo facturado (débitos), lo abonado (créditos) y lo que queda. */
  debitos: number; creditos: number; saldo: number;
  vencido: number; vencidos: number;
  /** El vencimiento más viejo de lo abierto. */
  desde: string | null;
};

export type ContactoDirectorio<F> = {
  clave: string;
  rol: RolDirectorio;
  nombre: string;
  ficha: F | null;
  resumen: ResumenContacto;
  cuentas: CuentaDirectorio[];
};

/** El mismo nombre escrito con espacios o mayúsculas distintas es el mismo contacto. */
export const claveContacto = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

const CERO = 0.00005;
const abierta = (c: CuentaDirectorio) => c.estado !== "liquidada" && c.saldo > CERO;

export function resumirCuentas(cuentas: CuentaDirectorio[]): ResumenContacto {
  const abiertas = cuentas.filter(abierta);
  const vencidas = abiertas.filter((c) => c.dias < 0);
  const suma = (xs: CuentaDirectorio[], k: "monto" | "abonado" | "saldo") => Math.round(xs.reduce((a, c) => a + c[k], 0) * 1e4) / 1e4;
  return {
    documentos: cuentas.length, abiertos: abiertas.length,
    debitos: suma(cuentas, "monto"), creditos: suma(cuentas, "abonado"), saldo: suma(abiertas, "saldo"),
    vencido: suma(vencidas, "saldo"), vencidos: vencidas.length,
    desde: abiertas.map((c) => c.vence).sort()[0] ?? null,
  };
}

/** Une las fichas de un rol con su cartera: una entrada por contacto. */
export function armarDirectorio<F extends { nombre: string }>(
  rol: RolDirectorio, fichas: F[], cuentas: CuentaDirectorio[],
): ContactoDirectorio<F>[] {
  const porClave = new Map<string, CuentaDirectorio[]>();
  for (const c of cuentas) {
    const k = claveContacto(c.contraparte);
    porClave.set(k, [...(porClave.get(k) ?? []), c]);
  }
  const vistas = new Set<string>();
  const salida: ContactoDirectorio<F>[] = [];
  for (const f of fichas) {
    const k = claveContacto(f.nombre);
    if (vistas.has(k)) continue; // dos fichas con el mismo nombre: la primera
    vistas.add(k);
    const cs = porClave.get(k) ?? [];
    salida.push({ clave: `${rol}:${k}`, rol, nombre: f.nombre.trim(), ficha: f, resumen: resumirCuentas(cs), cuentas: cs });
  }
  for (const [k, cs] of porClave) {
    if (vistas.has(k)) continue;
    salida.push({ clave: `${rol}:${k}`, rol, nombre: cs[0].contraparte.trim(), ficha: null, resumen: resumirCuentas(cs), cuentas: cs });
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true }));
}

/** Iniciales para el avatar: «SERVICIOS Y SUMINISTROS V&B» → «SS». */
export function iniciales(nombre: string): string {
  const palabras = nombre.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((p) => p && !/^(Y|DE|DEL|LA|LOS|LAS|EL|C|A|CA|S)$/i.test(p));
  return ((palabras[0]?.[0] ?? "") + (palabras[1]?.[0] ?? palabras[0]?.[1] ?? "")).toUpperCase() || "?";
}

/** Buscar por nombre, RIF o código. */
export function coincide(c: { nombre: string; ficha: { rif?: string | null; codigo?: string | null } | null }, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const plano = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[\s.-]/g, "");
  return c.nombre.toLowerCase().includes(t) || plano(c.ficha?.rif).includes(plano(t)) || plano(c.ficha?.codigo).includes(plano(t));
}
