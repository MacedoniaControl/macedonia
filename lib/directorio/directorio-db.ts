"use server";

// Clientes y proveedores. Ver supabase/15-clientes-proveedores.sql.
//
// La ficha es COMPARTIDA entre las dos empresas: son de los mismos dueños y
// cargar el mismo cliente dos veces produce dos versiones del mismo nombre.
// Los documentos, en cambio, siguen separados por empresa.
//
// El RIF es la clave. No hay un código aparte que alguien tenga que inventar.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import { normalizarRif } from "./rif";

export type TipoPersona = "natural" | "juridica";

export type Cliente = {
  id: number;
  /** Opcional: el mostrador no siempre lo pide. Único cuando está. */
  rif: string | null;
  tipoPersona: TipoPersona;
  nombre: string;
  denominacion: string | null;
  contacto: string | null;
  correo: string | null;
  telefonos: string | null;
  direccion: string | null;
  ciudad: string | null;
  limiteCredito: number;
  diasCredito: number;
  notas: string | null;
  activo: boolean;
  /** Ficha de Valery (migración 44). */
  codigo: string | null; pais: string | null; estadoRegion: string | null; municipio: string | null;
  fax: string | null; referencia: string | null; grupo: string | null;
  zonaVentas: string | null; tipoPrecio: string | null; descuentoPct: number; aceptaCheque: boolean;
};

// No deriva de Cliente: el proveedor SI se identifica por RIF (sale del libro
// de compras, donde es obligatorio), mientras que el cliente puede no tenerlo.
export type Proveedor = {
  rif: string;
  tipoPersona: TipoPersona;
  nombre: string;
  nacional: boolean;
  contacto: string | null;
  correo: string | null;
  telefonos: string | null;
  direccion: string | null;
  ciudad: string | null;
  limiteCredito: number;
  diasCredito: number;
  pctRetencion: number;
  notas: string | null;
  activo: boolean;
  /** Ficha de Valery (migración 44). */
  codigo: string | null; denominacion: string | null; pais: string | null; estadoRegion: string | null;
  municipio: string | null; fax: string | null; referencia: string | null; grupo: string | null;
};

// ------------------------------------------------------------------ CLIENTES

export async function buscarClientes(consulta: string, limite = 10): Promise<Cliente[]> {
  const q = consulta.trim();
  if (q.length < 2) return [];

  const sb = await createClient();
  const patron = `%${q.replace(/[%_]/g, "")}%`;
  const { data, error } = await sb
    .from("clientes")
    .select("*")
    .eq("activo", true)
    .or(`nombre.ilike.${patron},rif.ilike.${patron}`)
    .limit(limite);

  if (error) throw new Error(`No se pudieron buscar clientes: ${error.message}`);
  return (data ?? []).map(aCliente);
}

/**
 * La ficha de un cliente por su nombre en la cartera (para el estado de cuenta).
 * Primero el nombre exacto (sin mayúsculas ni espacios de más); si no, el que
 * empieza igual. Sin ficha, null: el documento sale con el nombre solo.
 */
/** Todas las fichas de clientes (activas e inactivas), por nombre: el Directorio. */
export async function listarClientes(): Promise<Cliente[]> {
  const sb = await createClient();
  // De a 1.000: la base no devuelve más filas por consulta.
  const filas: Parameters<typeof aCliente>[0][] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from("clientes").select("*").order("id").range(desde, desde + 999);
    if (error) throw new Error(`No se pudieron leer los clientes: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return filas.map(aCliente);
}

/** Todas las fichas de proveedores (activas e inactivas), por nombre: el Directorio. */
export async function listarProveedoresTodos(): Promise<Proveedor[]> {
  const sb = await createClient();
  const filas: Parameters<typeof aProveedor>[0][] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from("proveedores").select("*").order("rif").range(desde, desde + 999);
    if (error) throw new Error(`No se pudieron leer los proveedores: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return filas.map(aProveedor);
}

export async function clientePorNombre(nombre: string): Promise<Cliente | null> {
  const n = nombre.trim().replace(/\s+/g, " ").replace(/[%_]/g, "");
  if (!n) return null;
  const sb = await createClient();
  const exacto = await sb.from("clientes").select("*").ilike("nombre", n).limit(1);
  if (exacto.data?.length) return aCliente(exacto.data[0]);
  const parecido = await sb.from("clientes").select("*").ilike("nombre", `${n}%`).limit(1);
  return parecido.data?.length ? aCliente(parecido.data[0]) : null;
}

/** Lo mismo para un proveedor (estado de cuenta por pagar). */
export async function proveedorPorNombre(nombre: string): Promise<Proveedor | null> {
  const n = nombre.trim().replace(/\s+/g, " ").replace(/[%_]/g, "");
  if (!n) return null;
  const sb = await createClient();
  const exacto = await sb.from("proveedores").select("*").ilike("nombre", n).limit(1);
  if (exacto.data?.length) return aProveedor(exacto.data[0]);
  const parecido = await sb.from("proveedores").select("*").ilike("nombre", `${n}%`).limit(1);
  return parecido.data?.length ? aProveedor(parecido.data[0]) : null;
}

export async function clientePorRif(rif: string): Promise<Cliente | null> {
  const sb = await createClient();
  const { data } = await sb.from("clientes").select("*").eq("rif", normalizarRif(rif)).maybeSingle();
  return data ? aCliente(data) : null;
}

export async function guardarCliente(
  c: Partial<Cliente> & { nombre: string },
): Promise<{ ok: true; cliente: Cliente } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  // El RIF quedo opcional: Macedonia no emite documentos fiscales, y mas de la
  // mitad de la cartera son personas naturales que compran en el mostrador.
  // Cadena vacia -> null, porque dos cadenas vacias chocarian contra el unique.
  const rif = c.rif ? normalizarRif(c.rif) || null : null;
  if (!c.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio." };

  const sb = await createClient();
  const fila = {
      tipo_persona: c.tipoPersona ?? "juridica",
      nombre: c.nombre.trim(),
      denominacion: c.denominacion?.trim() || null,
      contacto: c.contacto?.trim() || null,
      correo: c.correo?.trim() || null,
      telefonos: c.telefonos?.trim() || null,
      direccion: c.direccion?.trim() || null,
      ciudad: c.ciudad?.trim() || null,
      limite_credito: c.limiteCredito ?? 0,
      dias_credito: c.diasCredito ?? 0,
      notas: c.notas?.trim() || null,
      ...camposValery(c),
      ...(c.zonaVentas !== undefined ? { zona_ventas: c.zonaVentas?.trim() || null } : {}),
      ...(c.tipoPrecio !== undefined ? { tipo_precio: c.tipoPrecio?.trim() || null } : {}),
      ...(c.descuentoPct !== undefined ? { descuento_pct: c.descuentoPct ?? 0 } : {}),
      ...(c.aceptaCheque !== undefined ? { acepta_cheque: c.aceptaCheque } : {}),
      ...(c.activo !== undefined ? { activo: c.activo } : {}),
      creado_por: usuario.id,
    };

  // Con RIF se puede deduplicar; sin RIF no hay contra que comparar, asi que
  // cada alta es un cliente nuevo. Forzar un upsert sin clave real terminaria
  // pisando fichas distintas que comparten nombre.
  // Una ficha que ya existe se actualiza por su id: sin RIF, «guardar» creaba
  // otra ficha igual cada vez.
  const q = c.id
    ? sb.from("clientes").update({ ...fila, rif }).eq("id", c.id)
    : rif
    ? sb.from("clientes").upsert({ ...fila, rif }, { onConflict: "rif" })
    : sb.from("clientes").insert(fila);

  const { data, error } = await q
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: `No se pudo guardar: ${error?.message}` };
  return { ok: true, cliente: aCliente(data) };
}

/**
 * Cuánto debe este cliente EN ESTA empresa, y si pasa su límite.
 *
 * El saldo es por empresa, no sumado: la ficha se comparte pero la deuda no.
 * Y el límite AVISA, no bloquea — nadie queda trabado en el mostrador.
 */
export async function saldoCliente(
  clienteId: number,
  empresa: string,
): Promise<{ debe: number; limite: number; excedido: boolean }> {
  const sb = await createClient();
  const { data } = await sb
    .from("clientes_saldo")
    .select("debe, limite_credito")
    .eq("id", clienteId)
    .eq("empresa_id", empresa)
    .maybeSingle();

  const debe = Number(data?.debe ?? 0);
  const limite = Number(data?.limite_credito ?? 0);
  return { debe, limite, excedido: limite > 0 && debe > limite };
}

// --------------------------------------------------------------- PROVEEDORES

export async function buscarProveedores(consulta: string, limite = 10): Promise<Proveedor[]> {
  const q = consulta.trim();
  if (q.length < 2) return [];

  const sb = await createClient();
  const patron = `%${q.replace(/[%_]/g, "")}%`;
  const { data, error } = await sb
    .from("proveedores")
    .select("*")
    .eq("activo", true)
    .or(`nombre.ilike.${patron},rif.ilike.${patron}`)
    .limit(limite);

  if (error) throw new Error(`No se pudieron buscar proveedores: ${error.message}`);
  return (data ?? []).map(aProveedor);
}

/**
 * Todos los proveedores activos, por nombre. buscarProveedores exige al menos
 * dos letras, y Compras la llamaba con "" para llenar su selector: el selector
 * de la orden de compra salia siempre vacio.
 */
export async function listarProveedores(limite = 1000): Promise<Proveedor[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("proveedores").select("*").eq("activo", true).order("nombre").limit(limite);
  if (error) throw new Error(`No se pudieron leer los proveedores: ${error.message}`);
  return (data ?? []).map(aProveedor);
}

export async function guardarProveedor(
  p: Partial<Proveedor> & { rif: string; nombre: string },
): Promise<{ ok: true; proveedor: Proveedor } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  const rif = normalizarRif(p.rif);
  if (!rif) return { ok: false, error: "El RIF es obligatorio: es el código del proveedor." };
  if (!p.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio." };

  const sb = await createClient();
  const { data, error } = await sb
    .from("proveedores")
    .upsert({
      rif,
      tipo_persona: p.tipoPersona ?? "juridica",
      nombre: p.nombre.trim(),
      nacional: p.nacional ?? true,
      contacto: p.contacto?.trim() || null,
      correo: p.correo?.trim() || null,
      telefonos: p.telefonos?.trim() || null,
      direccion: p.direccion?.trim() || null,
      ciudad: p.ciudad?.trim() || null,
      dias_credito: p.diasCredito ?? 0,
      limite_credito: p.limiteCredito ?? 0,
      pct_retencion: p.pctRetencion ?? 0,
      notas: p.notas?.trim() || null,
      ...camposValery(p),
      ...(p.denominacion !== undefined ? { denominacion: p.denominacion?.trim() || null } : {}),
      ...(p.activo !== undefined ? { activo: p.activo } : {}),
      creado_por: usuario.id,
    }, { onConflict: "rif" })
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: `No se pudo guardar: ${error?.message}` };
  return { ok: true, proveedor: aProveedor(data) };
}

// ------------------------------------------------------------------ mapeo

/** Los campos de la ficha de Valery que comparten cliente y proveedor (solo los que vienen). */
function camposValery(x: { codigo?: string | null; pais?: string | null; estadoRegion?: string | null; municipio?: string | null; fax?: string | null; referencia?: string | null; grupo?: string | null }) {
  const t = (v: string | null | undefined) => v?.trim() || null;
  return {
    ...(x.codigo !== undefined ? { codigo: t(x.codigo) } : {}),
    ...(x.pais !== undefined ? { pais: t(x.pais) } : {}),
    ...(x.estadoRegion !== undefined ? { estado_region: t(x.estadoRegion) } : {}),
    ...(x.municipio !== undefined ? { municipio: t(x.municipio) } : {}),
    ...(x.fax !== undefined ? { fax: t(x.fax) } : {}),
    ...(x.referencia !== undefined ? { referencia: t(x.referencia) } : {}),
    ...(x.grupo !== undefined ? { grupo: t(x.grupo) } : {}),
  };
}

type FilaValery = {
  activo?: boolean; codigo?: string | null; pais?: string | null; estado_region?: string | null; municipio?: string | null;
  fax?: string | null; referencia?: string | null; grupo?: string | null;
};
const valery = (f: FilaValery) => ({
  activo: f.activo ?? true, codigo: f.codigo ?? null, pais: f.pais ?? null, estadoRegion: f.estado_region ?? null,
  municipio: f.municipio ?? null, fax: f.fax ?? null, referencia: f.referencia ?? null, grupo: f.grupo ?? null,
});

type FilaBase = {
  tipo_persona: TipoPersona; nombre: string;
  contacto: string | null; correo: string | null; telefonos: string | null;
  direccion: string | null; ciudad: string | null;
  limite_credito: number; dias_credito: number; notas: string | null;
};

// Sin el RIF: el cliente lo tiene opcional y el proveedor obligatorio, asi que
// cada uno lo agrega con su propio tipo.
const base = (f: FilaBase) => ({
  tipoPersona: f.tipo_persona,
  nombre: f.nombre,
  contacto: f.contacto,
  correo: f.correo,
  telefonos: f.telefonos,
  direccion: f.direccion,
  ciudad: f.ciudad,
  limiteCredito: Number(f.limite_credito) || 0,
  diasCredito: Number(f.dias_credito) || 0,
  notas: f.notas,
});

function aCliente(
  f: FilaBase & FilaValery & { id: number; rif: string | null; denominacion: string | null;
    zona_ventas?: string | null; tipo_precio?: string | null; descuento_pct?: number | null; acepta_cheque?: boolean | null },
): Cliente {
  return {
    ...base(f), ...valery(f), id: f.id, rif: f.rif, denominacion: f.denominacion,
    zonaVentas: f.zona_ventas ?? null, tipoPrecio: f.tipo_precio ?? null,
    descuentoPct: Number(f.descuento_pct ?? 0) || 0, aceptaCheque: f.acepta_cheque ?? true,
  };
}

function aProveedor(
  f: FilaBase & FilaValery & { rif: string; nacional: boolean; pct_retencion: number; denominacion?: string | null },
): Proveedor {
  return { ...base(f), ...valery(f), rif: f.rif, nacional: f.nacional, pctRetencion: Number(f.pct_retencion) || 0, denominacion: f.denominacion ?? null };
}
