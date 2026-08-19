/**
 * Datos del dashboard. Cifras REALES de Sumigases 2024 (derivadas de las matrices Excel,
 * ver docs/data/dashboard-mock-2024.md). Los KPIs "hoy/pendientes" y bloques sin fuente
 * puntual son demo, marcados con `demo: true`. Esta capa es solo presentación; no cambia
 * reglas de negocio ni modelo de datos.
 */

export const RATE_BS = 49.5; // Bs/$ representativo 2024 (demo)

export type Money = { usd: number; bs: number };
export const usd = (n: number): Money => ({ usd: n, bs: Math.round(n * RATE_BS) });

export const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const series = {
  ventas: [6615, 9712, 9056, 23888, 17799, 21312, 20456, 47861, 23485, 38228, 41922, 50530],
  compras: [3544, 3402, 1601, 6046, 3479, 4616, 4165, 13539, 7784, 8143, 12975, 19907],
  utilidad: [439, 2245, 2664, 8035, 4535, 6592, 3265, 15532, 7460, 16208, 14715, 25136],
  factura: [1980, 3430, 4842, 9916, 6261, 12104, 12601, 35358, 12798, 18780, 26618, 41960],
  notasEntrega: [4635, 6282, 4214, 13972, 11538, 9208, 7855, 12503, 10687, 19448, 15304, 8570],
};

export type KpiDatum = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tone: "brand" | "navy" | "ok" | "warn" | "danger" | "info";
  demo?: boolean;
};

// Los KPIs operativos ("hoy / pendientes") no tienen fuente real todavía: van en CERO.
// Antes mostraban cifras inventadas indistinguibles de un dato verdadero, y alguien
// podía decidir sobre ellas. Se llenarán cuando el backend los alimente.
export const kpis: KpiDatum[] = [
  { key: "ventasHoy", label: "Ventas hoy", value: "$0", sub: "sin datos", tone: "brand", demo: true },
  { key: "cxc", label: "Cuentas por cobrar", value: "$0", sub: "0 documentos", tone: "warn", demo: true },
  { key: "cxp", label: "Cuentas por pagar", value: "$0", sub: "0 proveedores", tone: "danger", demo: true },
  { key: "stock", label: "Stock crítico", value: "0", sub: "productos bajo mínimo", tone: "warn", demo: true },
  { key: "cilPend", label: "Cilindros pendientes", value: "0", sub: "por retorno", tone: "info", demo: true },
  { key: "recargas", label: "Recargas pendientes", value: "0", sub: "en cola", tone: "info", demo: true },
  { key: "pedidos", label: "Pedidos pendientes", value: "0", sub: "por despachar", tone: "navy", demo: true },
  { key: "balance", label: "Balance general", value: "$106.826", sub: "utilidad neta 2024", tone: "ok" },
];

export type RoiCard = {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
};

export const roiCards: RoiCard[] = [
  { label: "ROI del mes", value: "53,3%", sub: "utilidad / inversión", accent: true },
  { label: "Utilidad estimada", value: "$106.826", sub: "acumulado 2024" },
  { label: "Margen bruto", value: "48,0%", sub: "sobre ventas" },
  { label: "Ventas vs compras", value: "$310.865 / $89.203", sub: "ratio 3,5x" },
];

export const productosMayorRetorno = [
  { nombre: "Electrodo 7018 5/32 Linconl", roi: 298 },
  { nombre: "Nitrógeno gaseoso 6M³", roi: 316 },
  { nombre: "Soplete 36\" Victor", roi: 197 },
  { nombre: "Regulador de argón c/ flujómetro", roi: 147 },
  { nombre: "Oxígeno gaseoso 6M³", roi: 78 },
];

export const categoriasMasRentables = [
  { nombre: "Gases industriales y medicinales", margen: 55 },
  { nombre: "Electrodos y varillas", margen: 49 },
  { nombre: "Reguladores y válvulas", margen: 41 },
  { nombre: "Portaelectrodos y antorchas", margen: 38 },
];

// El conteo real de cilindros lo dará el módulo de Cilindros cuando se rehaga
// con el proceso real. Hasta entonces, cero: no inventar un parque de cilindros.
export const cilindrosPorEstado = [
  { estado: "Lleno", cantidad: 0, tone: "ok" as const },
  { estado: "Vacío", cantidad: 0, tone: "muted" as const },
  { estado: "En cliente", cantidad: 0, tone: "info" as const },
  { estado: "Pendiente por retorno", cantidad: 0, tone: "warn" as const },
];

// Requiere mínimos definidos por producto, que todavía no existen.
export const stockCriticoPorAlmacen = [
  { almacen: "Lechería", criticos: 0 },
  { almacen: "Cumaná", criticos: 0 },
];

// El módulo de Importaciones se eliminó a pedido del cliente.
export const importacionesRecientes: { archivo: string; fecha: string; filas: number; estado: string }[] = [];

// Vacío a propósito: una alerta falsa es peor que ninguna alerta. Se llenará
// cuando haya reglas reales (mínimos de stock, retornos vencidos, etc.).
export const alertasOperativas: { tone: "warn" | "info" | "danger"; titulo: string; mensaje: string }[] = [];

export const companies = [
  { id: "sumigases", name: "Sumigases" },
  { id: "sudematin", name: "Sudematin" },
];
