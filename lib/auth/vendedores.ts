"use server";

// Quiénes pueden figurar como vendedor en un documento.
//
// Antes el campo venía escrito a mano ("01 - GERENTE"), igual para todos: no
// se sabía quién había hecho cada cotización. Ahora sale de la tabla de
// usuarios, así que el nombre que queda impreso corresponde a alguien real.

import { createClient } from "@/lib/supabase/server";

export type Vendedor = { id: string; nombre: string; rol: string };

export async function vendedoresDe(empresa: string): Promise<Vendedor[]> {
  const sb = await createClient();

  // El owner de la casa matriz tiene empresa_id null: ve las dos y puede
  // figurar en cualquiera. Por eso entra en el listado de ambas.
  const { data, error } = await sb
    .from("usuarios")
    .select("id, nombre, rol, empresa_id")
    .eq("activo", true)
    .or(`empresa_id.eq.${empresa},empresa_id.is.null`)
    .order("nombre");

  if (error) throw new Error(`No se pudieron leer los vendedores: ${error.message}`);

  // Los técnicos de almacén no venden: no tiene sentido ofrecerlos.
  return (data ?? [])
    .filter((u) => u.rol !== "tecnico")
    .map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol }));
}
