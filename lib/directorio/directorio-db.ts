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

export type TipoPersona = "natural" | "juridica";

export type Cliente = {
  rif: string;
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
};

export type Proveedor = Omit<Cliente, "denominacion"> & {
  nacional: boolean;
  pctRetencion: number;
};

/** Normaliza el RIF: sin espacios, en mayúsculas. J-123 y j 123 son el mismo. */
export function normalizarRif(rif: string): string {
  return rif.trim().toUpperCase().replace(/\s+/g, "");
}

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

export async function clientePorRif(rif: string): Promise<Cliente | null> {
  const sb = await createClient();
  const { data } = await sb.from("clientes").select("*").eq("rif", normalizarRif(rif)).maybeSingle();
  return data ? aCliente(data) : null;
}

export async function guardarCliente(
  c: Partial<Cliente> & { rif: string; nombre: string },
): Promise<{ ok: true; cliente: Cliente } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  const rif = normalizarRif(c.rif);
  if (!rif) return { ok: false, error: "El RIF es obligatorio: es el código del cliente." };
  if (!c.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio." };

  const sb = await createClient();
  const { data, error } = await sb
    .from("clientes")
    .upsert({
      rif,
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
      creado_por: usuario.id,
    }, { onConflict: "rif" })
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
  rif: string,
  empresa: string,
): Promise<{ debe: number; limite: number; excedido: boolean }> {
  const sb = await createClient();
  const { data } = await sb
    .from("clientes_saldo")
    .select("debe, limite_credito")
    .eq("rif", normalizarRif(rif))
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
      creado_por: usuario.id,
    }, { onConflict: "rif" })
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: `No se pudo guardar: ${error?.message}` };
  return { ok: true, proveedor: aProveedor(data) };
}

// ------------------------------------------------------------------ mapeo

type FilaBase = {
  rif: string; tipo_persona: TipoPersona; nombre: string;
  contacto: string | null; correo: string | null; telefonos: string | null;
  direccion: string | null; ciudad: string | null;
  limite_credito: number; dias_credito: number; notas: string | null;
};

const base = (f: FilaBase) => ({
  rif: f.rif,
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

function aCliente(f: FilaBase & { denominacion: string | null }): Cliente {
  return { ...base(f), denominacion: f.denominacion };
}

function aProveedor(f: FilaBase & { nacional: boolean; pct_retencion: number }): Proveedor {
  return { ...base(f), nacional: f.nacional, pctRetencion: Number(f.pct_retencion) || 0 };
}
