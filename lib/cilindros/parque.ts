// Resumen del parque: cuantos cilindros hay y donde estan.
//
// Reemplaza a la hoja "TOTAL GENERAL" del Excel, que tenia la forma correcta
// -DESCRIPCION / LLENOS / VACIOS / STOCK sobre oficina, camion y prestados-
// pero ni un solo numero: su unica celda con formula apuntaba a una celda
// borrada y devolvia #REF!. Aqui las mismas preguntas se responden sumando los
// movimientos, asi que el resumen no puede quedar viejo ni romperse.
//
// Una decision que importa: solo "en planta" se abre en llenos y vacios. Un
// cilindro en llenado o en poder de un cliente no tiene ese dato -nadie lo
// reporto- y rellenarlo seria inventar. Esas filas dicen cuantos son y callan
// lo que no saben.

import type { SaldoCilindro, EstadoCilindro } from "./cilindros-db.ts";

export type Ubicacion = {
  id: string;
  descripcion: string;
  /** null = el estado no distingue lleno de vacio; no es lo mismo que cero. */
  llenos: number | null;
  vacios: number | null;
  total: number;
};

export type Parque = {
  ubicaciones: Ubicacion[];
  porGas: { gas: string; total: number }[];
  total: number;
  enPlanta: number;
  afuera: number;
  /** Sin un solo movimiento no hay parque que resumir: es distinto de cero. */
  sinDatos: boolean;
};

const suma = (s: SaldoCilindro[], estados: EstadoCilindro[], gas?: string) =>
  s.reduce(
    (n, x) => (estados.includes(x.estado) && (!gas || x.gas === gas) ? n + x.cantidad : n),
    0,
  );

export function resumirParque(saldos: SaldoCilindro[]): Parque {
  const llenos = suma(saldos, ["lleno"]);
  const vacios = suma(saldos, ["vacio"]);
  const enLlenado = suma(saldos, ["en_llenado"]);
  const enCliente = suma(saldos, ["en_cliente"]);
  const fuera = suma(saldos, ["fuera_servicio"]);

  const ubicaciones: Ubicacion[] = [
    { id: "planta", descripcion: "En planta", llenos, vacios, total: llenos + vacios },
    { id: "llenado", descripcion: "En llenado", llenos: null, vacios: null, total: enLlenado },
    { id: "cliente", descripcion: "Prestados a clientes", llenos: null, vacios: null, total: enCliente },
    { id: "fuera", descripcion: "Fuera de servicio", llenos: null, vacios: null, total: fuera },
  ];

  const gases = [...new Set(saldos.map((x) => x.gas))].sort();
  const porGas = gases
    .map((gas) => ({ gas, total: suma(saldos, ["lleno", "vacio", "en_llenado", "en_cliente", "fuera_servicio"], gas) }))
    .sort((a, b) => b.total - a.total || a.gas.localeCompare(b.gas));

  return {
    ubicaciones,
    porGas,
    total: llenos + vacios + enLlenado + enCliente + fuera,
    enPlanta: llenos + vacios,
    // "Afuera" es lo que hay que ir a buscar. Fuera de servicio no entra: esta
    // en casa, solo que no sirve.
    afuera: enCliente,
    sinDatos: saldos.length === 0,
  };
}
