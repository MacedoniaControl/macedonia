"use client";

// Conversión y Regularización Fiscal de Inventario.
// Modelo: V = stock_valery (Físico), S = stock_s (informal), M = stock_maestro (físico real).
// Ver docs/decisions/inventory-model.md. Capa de "controllers" portable a un backend real:
// las funciones convertirDirecta() y regularizarEnBloque() ejecutan la aritmética exacta y
// registran transacciones en un ledger append-only. El flag afectaInventarioReal evita duplicar
// movimientos físicos: cuando es false, el Maestro (M) NO se mueve.

import { useEffect, useState } from "react";
import { fisicoExistencia } from "./inventory-data";
import { addNotif } from "./notifications";

export type ClienteFiscal = { nombre: string; rif: string; direccion?: string };
export type NotaLinea = { codigo: string; nombre: string; cantidad: number };
export type CompraProveedor = { facturaProveedor: string; proveedor: string; costo: number };

export type NotaEntrega = {
  id: string;
  numero: string;
  cliente: ClienteFiscal;
  fecha: string;
  lineas: NotaLinea[];
  estado: "pendiente" | "facturada";
  flujo?: "A" | "B";
  facturaFiscal?: string;
  compra?: CompraProveedor;
};

export type FiscalTx = {
  id: string;
  notaId: string;
  tipo: "compra-fiscal" | "venta-fiscal";
  codigo: string;
  cantidad: number;
  vDelta: number; // efecto en stock_valery (V)
  sDelta: number; // efecto en stock_s (S)
  mDelta: number; // efecto en stock_maestro (M)
  afectaInventarioReal: boolean;
  fecha: string;
  meta?: Record<string, unknown>;
};

// ---------------------------------------------------------------- persistencia (demo)
// Claves AISLADAS POR EMPRESA: las notas pendientes y el ledger fiscal de
// Sumigases y Sudematin nunca deben compartirse.
const kNotas = (empresa: string) => `sumi:fiscal-notas:${empresa}`;
const kLedger = (empresa: string) => `sumi:fiscal-ledger:${empresa}`;
const EV = "sumi:fiscal";

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EV));
}

export function getNotas(empresa = "sumigases"): NotaEntrega[] {
  const stored = read<NotaEntrega[] | null>(kNotas(empresa), null);
  if (stored) return stored;
  // Semilla de demo solo para Sumigases; Sudematin arranca vacío.
  if (empresa !== "sumigases") return [];
  write(kNotas(empresa), SEED_NOTAS);
  return SEED_NOTAS;
}
export function getLedger(empresa = "sumigases"): FiscalTx[] {
  return read<FiscalTx[]>(kLedger(empresa), []);
}
function saveNotas(list: NotaEntrega[], empresa: string) {
  write(kNotas(empresa), list);
}
function appendLedger(txs: FiscalTx[], empresa: string) {
  write(kLedger(empresa), [...txs, ...getLedger(empresa)]);
}

export function subscribeFiscal(cb: () => void) {
  const h = () => cb();
  window.addEventListener(EV, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EV, h);
    window.removeEventListener("storage", h);
  };
}
export function useFiscal(empresa = "sumigases") {
  // `ready` distingue "aún no hidratado" de "hidratado y vacío": sin esto el
  // servidor pinta 0 y al hidratar salta al valor real (parpadeo de dato falso).
  const [state, setState] = useState<{ notas: NotaEntrega[]; ledger: FiscalTx[]; ready: boolean }>({
    notas: [],
    ledger: [],
    ready: false,
  });
  useEffect(() => {
    const load = () => setState({ notas: getNotas(empresa), ledger: getLedger(empresa), ready: true });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return subscribeFiscal(load);
  }, [empresa]);
  return state;
}

// ---------------------------------------------------------------- reducers V / S / M
function sumDelta(ledger: FiscalTx[], codigo: string, field: "vDelta" | "sDelta" | "mDelta"): number {
  return ledger.reduce((acc, t) => (t.codigo === codigo ? acc + t[field] : acc), 0);
}
/** Stock fiscal actual (V) = base Valery + efecto del ledger. */
export function stockValery(codigo: string, ledger: FiscalTx[], empresa = "sumigases"): number {
  return round(fisicoExistencia(codigo, empresa) + sumDelta(ledger, codigo, "vDelta"));
}
/** Balance informal actual (S). Base opcional del Inventario S manual. */
export function stockS(codigo: string, ledger: FiscalTx[], baseS = 0): number {
  return round(baseS + sumDelta(ledger, codigo, "sDelta"));
}
/** Stock maestro / físico real (M) = base física + solo movimientos que afectan inventario real. */
export function stockMaestro(codigo: string, ledger: FiscalTx[], empresa = "sumigases"): number {
  return round(fisicoExistencia(codigo, empresa) + sumDelta(ledger, codigo, "mDelta"));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- semáforo
export type Semaforo = "verde" | "ambar";
export function lineaSuficiente(linea: NotaLinea, ledger: FiscalTx[], empresa = "sumigases"): boolean {
  return stockValery(linea.codigo, ledger, empresa) >= linea.cantidad;
}
export function semaforoNota(nota: NotaEntrega, ledger: FiscalTx[], empresa = "sumigases"): Semaforo {
  return nota.lineas.every((l) => lineaSuficiente(l, ledger, empresa)) ? "verde" : "ambar";
}
export function lineasInsuficientes(nota: NotaEntrega, ledger: FiscalTx[], empresa = "sumigases"): NotaLinea[] {
  return nota.lineas.filter((l) => !lineaSuficiente(l, ledger, empresa));
}

// Alerta al bell (OWNER/ADMIN): registra la factura fiscal cargada en Valery.
function alertaFactura(nota: NotaEntrega, facturaValery: string, flujo: "A" | "B") {
  addNotif({
    id: `fact-${nota.id}-${Date.now()}`,
    tipo: "factura-fiscal",
    titulo: "Factura fiscal registrada — verificar en Valery",
    mensaje: `${nota.numero} (${nota.cliente.nombre}) se convirtió con la factura ${facturaValery} de Valery${flujo === "B" ? " (con regularización de compra)" : ""}.`,
    para: "OWNER/ADMIN",
    estado: "pendiente",
    hora: new Date().toLocaleString("es-VE"),
    payload: { notaId: nota.id, facturaValery, flujo },
  });
}

// ---------------------------------------------------------------- CONTROLLER · Flujo A
// Hay stock fiscal (V >= cantidad). Descuenta V, S se salda (+cant), M intacto.
// facturaValery = código de la factura ya subida a Valery (obligatorio).
export function convertirDirecta(notaId: string, facturaValery: string, empresa = "sumigases"): { factura: string; txs: FiscalTx[] } {
  const notas = getNotas(empresa);
  const nota = notas.find((n) => n.id === notaId);
  if (!nota || nota.estado === "facturada") throw new Error("Nota no disponible");
  const factura = facturaValery.trim();
  if (!factura) throw new Error("Falta el código de la factura de Valery");
  const fecha = new Date().toISOString();
  const txs: FiscalTx[] = nota.lineas.map((l) => ({
    id: `tx-${notaId}-${l.codigo}-${Date.now()}`,
    notaId,
    tipo: "venta-fiscal",
    codigo: l.codigo,
    cantidad: l.cantidad,
    vDelta: -l.cantidad, // descuenta de Valery
    sDelta: +l.cantidad, // salda el balance informal
    mDelta: 0, // el maestro NO se mueve (ya se entregó físicamente)
    afectaInventarioReal: false,
    fecha,
    meta: { factura },
  }));
  appendLedger(txs, empresa);
  saveNotas(notas.map((n) => (n.id === notaId ? { ...n, estado: "facturada", flujo: "A", facturaFiscal: factura } : n)), empresa);
  alertaFactura(nota, factura, "A");
  return { factura, txs };
}

// ---------------------------------------------------------------- CONTROLLER · Flujo B
// No hay stock fiscal. Wizard: 1) inyecta Compra (V sube el déficit), 2) emite Venta (V baja cant).
// M intacto (afectaInventarioReal=false); S se salda (+cant).
export function regularizarEnBloque(notaId: string, compra: CompraProveedor, facturaValery: string, empresa = "sumigases"): { factura: string; txs: FiscalTx[] } {
  const notas = getNotas(empresa);
  const nota = notas.find((n) => n.id === notaId);
  if (!nota || nota.estado === "facturada") throw new Error("Nota no disponible");
  const factura = facturaValery.trim();
  if (!factura) throw new Error("Falta el código de la factura de Valery");
  const fecha = new Date().toISOString();
  const ledger = getLedger(empresa);
  const txs: FiscalTx[] = [];
  for (const l of nota.lineas) {
    const vActual = stockValery(l.codigo, ledger, empresa);
    const deficit = round(Math.max(0, l.cantidad - vActual));
    // Paso 1 — Compra fiscal en Valery (solo el déficit necesario)
    if (deficit > 0) {
      txs.push({
        id: `tx-c-${notaId}-${l.codigo}-${Date.now()}`,
        notaId,
        tipo: "compra-fiscal",
        codigo: l.codigo,
        cantidad: deficit,
        vDelta: +deficit, // sube stock fiscal
        sDelta: 0,
        mDelta: 0, // la mercancía ya estaba físicamente → NO afecta el maestro
        afectaInventarioReal: false,
        fecha,
        meta: { ...compra, factura },
      });
    }
    // Paso 2 — Venta fiscal en Valery
    txs.push({
      id: `tx-v-${notaId}-${l.codigo}-${Date.now()}`,
      notaId,
      tipo: "venta-fiscal",
      codigo: l.codigo,
      cantidad: l.cantidad,
      vDelta: -l.cantidad, // baja stock fiscal
      sDelta: +l.cantidad, // salda el balance informal
      mDelta: 0, // maestro intacto
      afectaInventarioReal: false,
      fecha,
      meta: { factura },
    });
  }
  appendLedger(txs, empresa);
  saveNotas(notas.map((n) => (n.id === notaId ? { ...n, estado: "facturada", flujo: "B", facturaFiscal: factura, compra } : n)), empresa);
  alertaFactura(nota, factura, "B");
  return { factura, txs };
}

// ---------------------------------------------------------------- seed demo (códigos reales de Valery)
const SEED_NOTAS: NotaEntrega[] = [
  {
    id: "ne-00012",
    numero: "NE-00012",
    cliente: { nombre: "Taller Industrial Anzoátegui, C.A.", rif: "J-30512477-8", direccion: "Zona Ind. Los Montones, Barcelona" },
    fecha: "2026-07-08",
    estado: "pendiente",
    lineas: [
      { codigo: "000068", nombre: "CONTAC TIP M 0.9 MILLER MATIC", cantidad: 3 },
      { codigo: "00001501", nombre: "FUNDENTE D/PLATA 1/4 LIBRA HARRIS", cantidad: 2 },
    ],
  },
  {
    id: "ne-00013",
    numero: "NE-00013",
    cliente: { nombre: "Metalúrgica Cumaná, C.A.", rif: "J-29118034-1", direccion: "Av. Perimetral, Cumaná" },
    fecha: "2026-07-09",
    estado: "pendiente",
    lineas: [
      { codigo: "00001102", nombre: "VARILLA DE PLATA PLANA 2%", cantidad: 4 },
      { codigo: "0-290-631", nombre: 'ESMERIL 4" 1/2 BOSCH 850W', cantidad: 1 },
    ],
  },
  {
    id: "ne-00014",
    numero: "NE-00014",
    cliente: { nombre: "Soldaduras del Oriente, F.P.", rif: "J-40233671-0", direccion: "Calle Bolívar, Puerto La Cruz" },
    fecha: "2026-07-09",
    estado: "pendiente",
    lineas: [{ codigo: "0008002", nombre: "REPRODUCTOR DANOM DA-X1200BT", cantidad: 1 }],
  },
  {
    id: "ne-00015",
    numero: "NE-00015",
    cliente: { nombre: "Construcciones Delta 2000, C.A.", rif: "J-31007788-5", direccion: "Sector Guaraguao, Guanta" },
    fecha: "2026-07-10",
    estado: "pendiente",
    lineas: [{ codigo: "00001601", nombre: "FUNDENTE D/BRONCE 1LB BORAX", cantidad: 1 }],
  },
];
