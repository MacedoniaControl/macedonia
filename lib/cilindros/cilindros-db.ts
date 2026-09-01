"use server";

// Cilindros. Ver supabase/11-cilindros.sql para el modelo y sus porqués.
//
// Se cuentan por cantidad, son de la empresa (comodato), y el técnico registra
// la entrega: cuántos llenos deja y cuántos vacíos trae. NO tienen por qué
// coincidir — puede dejar 5 y traer 3, y el saldo del cliente sube 2.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

export type EstadoCilindro = "lleno" | "vacio" | "en_cliente" | "en_llenado" | "fuera_servicio";

export type Gas = {
  nombre: string;
  seRellena: boolean;
  depositoUsd: number;
};

export type SaldoCilindro = {
  gas: string;
  estado: EstadoCilindro;
  cantidad: number;
};

export type Comodato = {
  cliente: string;
  gas: string;
  enPoder: number;
  desde: string | null;
  dias: number | null;
};

/** Una línea de la entrega: por cada gas, cuántos se dejan y cuántos se traen. */
export type LineaEntrega = {
  gas: string;
  llenosEntregados: number;
  vaciosRecibidos: number;
};

export async function gases(empresa: string): Promise<Gas[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("gases")
    .select("nombre, se_rellena, deposito_usd")
    .eq("empresa_id", empresa)
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error(`No se pudieron leer los gases: ${error.message}`);
  type Fila = { nombre: string; se_rellena: boolean; deposito_usd: number };
  return ((data as Fila[] | null) ?? []).map((g) => ({
    nombre: g.nombre,
    seRellena: g.se_rellena,
    depositoUsd: Number(g.deposito_usd) || 0,
  }));
}

export async function saldos(empresa: string): Promise<SaldoCilindro[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("cilindros_saldo")
    .select("gas, estado, cantidad")
    .eq("empresa_id", empresa);

  if (error) throw new Error(`No se pudieron leer los saldos: ${error.message}`);
  type Fila = { gas: string; estado: EstadoCilindro; cantidad: number };
  return ((data as Fila[] | null) ?? []).map((s) => ({
    gas: s.gas,
    estado: s.estado,
    cantidad: Number(s.cantidad) || 0,
  }));
}

export async function comodatos(empresa: string): Promise<Comodato[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("comodato_cliente")
    .select("cliente, gas, en_poder, desde, dias")
    .eq("empresa_id", empresa)
    .order("dias", { ascending: false, nullsFirst: false });

  if (error) throw new Error(`No se pudo leer el comodato: ${error.message}`);
  type Fila = { cliente: string; gas: string; en_poder: number; desde: string | null; dias: number | null };
  return ((data as Fila[] | null) ?? []).map((c) => ({
    cliente: c.cliente,
    gas: c.gas,
    enPoder: Number(c.en_poder) || 0,
    desde: c.desde,
    dias: c.dias === null ? null : Number(c.dias),
  }));
}

/**
 * Registra una entrega completa: por cada gas, los llenos que se dejan y los
 * vacíos que se traen.
 *
 * Genera hasta dos movimientos por gas, y son independientes a propósito:
 * dejar 5 y traer 3 es una visita normal, no un error. El saldo del cliente
 * sube o baja según la diferencia y el sistema lo calcula solo.
 */
export async function registrarEntrega(
  cliente: string,
  lineas: LineaEntrega[],
  empresa: string,
  documento?: string,
): Promise<{ ok: true; movimientos: number } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!cliente.trim()) return { ok: false, error: "Falta el cliente." };

  const utiles = lineas.filter((l) => l.llenosEntregados > 0 || l.vaciosRecibidos > 0);
  if (utiles.length === 0) return { ok: false, error: "No hay cilindros que registrar." };

  const sb = await createClient();
  const filas: Record<string, unknown>[] = [];

  for (const l of utiles) {
    if (l.llenosEntregados > 0) {
      // Sale un lleno del almacén y queda en poder del cliente.
      filas.push({
        empresa_id: empresa, gas: l.gas, cantidad: l.llenosEntregados,
        estado_desde: "lleno", estado_hacia: "en_cliente",
        cliente: cliente.trim(), documento: documento ?? null, usuario_id: usuario.id,
      });
    }
    if (l.vaciosRecibidos > 0) {
      // Vuelve un cilindro del cliente y entra vacío al almacén.
      filas.push({
        empresa_id: empresa, gas: l.gas, cantidad: l.vaciosRecibidos,
        estado_desde: "en_cliente", estado_hacia: "vacio",
        cliente: cliente.trim(), documento: documento ?? null, usuario_id: usuario.id,
      });
    }
  }

  const { error } = await sb.from("cilindros_mov").insert(filas);
  if (error) return { ok: false, error: `No se pudo registrar la entrega: ${error.message}` };

  return { ok: true, movimientos: filas.length };
}

/** Alta de cilindros al parque (compra). Sin estado previo: entran de la nada. */
export async function ingresarCilindros(
  gas: string,
  cantidad: number,
  estado: "lleno" | "vacio",
  empresa: string,
  nota?: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor que cero." };

  const sb = await createClient();
  const { error } = await sb.from("cilindros_mov").insert({
    empresa_id: empresa, gas, cantidad,
    estado_desde: null, estado_hacia: estado,
    nota: nota?.trim() || "Alta de cilindros", usuario_id: usuario.id,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Cambio de estado dentro del almacén: llenado, baja por daño, etc. */
export async function cambiarEstado(
  gas: string,
  cantidad: number,
  desde: EstadoCilindro,
  hacia: EstadoCilindro,
  empresa: string,
  nota?: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (desde === hacia) return { ok: false, error: "El estado de origen y destino son el mismo." };
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor que cero." };

  const sb = await createClient();
  const { error } = await sb.from("cilindros_mov").insert({
    empresa_id: empresa, gas, cantidad,
    estado_desde: desde, estado_hacia: hacia,
    nota: nota?.trim() || null, usuario_id: usuario.id,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Movimiento manual de cilindros: sumar o restar a mano.
 *
 * Para cuando la realidad del galpón no coincide con lo registrado y hay que
 * corregirla. No pisa el saldo: agrega un movimiento más, igual que todo lo
 * demás. Un ajuste que borra el historial esconde justo lo que hay que ver.
 *
 * La nota es obligatoria: un ajuste sin explicación es un agujero con permiso.
 */
export async function movimientoManual(
  gas: string,
  cantidad: number,
  direccion: "entrada" | "salida",
  estado: "lleno" | "vacio",
  empresa: string,
  nota: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor que cero." };
  if (!nota.trim()) return { ok: false, error: "Explicá el motivo del ajuste." };

  const sb = await createClient();
  const { error } = await sb.from("cilindros_mov").insert({
    empresa_id: empresa,
    gas,
    cantidad,
    // entrada: aparece de la nada. salida: desaparece hacia la nada.
    estado_desde: direccion === "entrada" ? null : estado,
    estado_hacia: direccion === "entrada" ? estado : null,
    nota: `Ajuste manual · ${nota.trim()}`,
    usuario_id: usuario.id,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Alta o edición de un gas y su depósito en garantía.
 *
 * El depósito estaba en 0 para los ocho gases, así que `garantias_cliente`
 * devolvía siempre cero SIN AVISAR que el dato faltaba — que es la peor forma
 * de estar mal: parece una respuesta.
 *
 * Se edita desde la pantalla y no se carga por SQL porque el precio del gas
 * cambia, y cada cambio no puede depender de que alguien escriba una consulta.
 */
export async function guardarGas(
  g: { nombre: string; depositoUsd: number; seRellena: boolean; activo?: boolean },
  empresa: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  const nombre = g.nombre.trim().toUpperCase();
  if (!nombre) return { ok: false, error: "Falta el nombre del gas." };
  if (!(g.depositoUsd >= 0)) return { ok: false, error: "El depósito no puede ser negativo." };

  const sb = await createClient();
  const { error } = await sb.from("gases").upsert(
    {
      empresa_id: empresa,
      nombre,
      deposito_usd: g.depositoUsd,
      se_rellena: g.seRellena,
      activo: g.activo ?? true,
    },
    { onConflict: "empresa_id,nombre" },
  );

  if (error) return { ok: false, error: `No se pudo guardar: ${error.message}` };
  return { ok: true };
}

/**
 * Baja lógica de un gas.
 *
 * No se borra: los movimientos históricos lo nombran, y borrarlo dejaría
 * huérfano todo lo que ya pasó por él.
 */
export async function desactivarGas(nombre: string, empresa: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb
    .from("gases")
    .update({ activo: false })
    .eq("empresa_id", empresa)
    .eq("nombre", nombre);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
