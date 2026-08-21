"use client";

// Resolver una lectura del escáner contra el catálogo de la base.
//
// Antes esto era una búsqueda en memoria con dos desenlaces: estaba o no estaba.
// Al leer de la base aparece un tercero — la base no responde — y confundirlo
// con "no encontrado" manda al operador a revisar una etiqueta que está bien.
//
// Por eso el resultado es explícito y hay que atender los tres casos.

export type ProductoEscaneado = {
  codigo: string;
  nombre: string;
  unidad: string | null;
  precio: number;
};

export type ResultadoEscaneo =
  | { estado: "encontrado"; producto: ProductoEscaneado }
  | { estado: "no-existe"; codigo: string }
  | { estado: "sin-sistema"; motivo: string };

/** Mensaje listo para mostrarle al operador, según el desenlace. */
export function mensajeDeEscaneo(r: ResultadoEscaneo): { ok: boolean; text: string } {
  if (r.estado === "no-existe") {
    return { ok: false, text: `Código "${r.codigo}" no está en el catálogo de esta empresa.` };
  }
  if (r.estado === "sin-sistema") {
    // Deliberadamente distinto de "no encontrado": el problema no es la etiqueta.
    return { ok: false, text: `El sistema no respondió. La lectura NO se registró — vuelve a escanear.` };
  }
  return { ok: true, text: r.producto.nombre };
}

export async function escanear(codigo: string, empresa: string): Promise<ResultadoEscaneo> {
  const c = codigo.trim();
  if (!c) return { estado: "no-existe", codigo };

  try {
    const r = await fetch("/api/inventory/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: c, empresa }),
    });

    const j = await r.json().catch(() => ({}));

    // 4xx por datos mal formados también es un fallo del sistema, no del código:
    // el operador no puede hacer nada al respecto y no debe creer que la
    // etiqueta está mal.
    if (!r.ok) return { estado: "sin-sistema", motivo: j?.error ?? `HTTP ${r.status}` };
    if (!j?.found || !j?.product) return { estado: "no-existe", codigo: c };

    return { estado: "encontrado", producto: j.product as ProductoEscaneado };
  } catch (e) {
    return { estado: "sin-sistema", motivo: (e as Error).message };
  }
}
