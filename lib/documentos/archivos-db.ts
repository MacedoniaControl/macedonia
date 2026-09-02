"use server";

// PDF de Valery en Supabase Storage. Ver supabase/18-archivos-valery.sql.
//
// Antes vivían como base64 en localStorage: se perdían al limpiar el navegador,
// solo los veía quien los había subido, y —peor— localStorage tiene un tope de
// ~5 MB. Un PDF en base64 pesa un tercio más que el original, así que con pocos
// archivos se llenaba, y al llenarse la escritura falla EN SILENCIO: el archivo
// aparecía en la lista y al recargar no estaba.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";

export type TipoArchivo = "nota_entrega" | "devolucion" | "cotizacion";

export type ArchivoValery = {
  id: number;
  tipo: TipoArchivo;
  correlativo: string | null;
  nombre: string;
  ruta: string;
  bytes: number | null;
  fecha: string;
};

const BUCKET = "valery";

/** El número que trae el nombre del archivo, si trae alguno. */
export async function correlativoDelNombre(nombre: string): Promise<string | null> {
  return (nombre.match(/\d{4,}/) ?? [null])[0];
}

/**
 * Sube un PDF y lo indexa.
 *
 * La ruta arranca con la empresa porque de ahí sale el permiso: la política del
 * bucket compara el primer tramo contra `puede_empresa`. Sin eso, cualquiera
 * con sesión leería los documentos de la otra empresa.
 */
export async function subirArchivo(
  archivo: File,
  tipo: TipoArchivo,
  empresa: string,
): Promise<{ ok: true; archivo: ArchivoValery } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (archivo.type !== "application/pdf") return { ok: false, error: "Solo se aceptan PDF." };
  if (archivo.size > 10 * 1024 * 1024) return { ok: false, error: "El archivo pasa de 10 MB." };

  const sb = await createClient();

  // Nombre limpio y con marca de tiempo: dos personas subiendo el mismo
  // "NET-0001.pdf" no pueden pisarse.
  const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-80);
  const ruta = `${empresa}/${tipo}/${Date.now()}-${limpio}`;

  const { error: errSubida } = await sb.storage.from(BUCKET).upload(ruta, archivo, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (errSubida) return { ok: false, error: `No se pudo subir: ${errSubida.message}` };

  const { data, error } = await sb
    .from("archivos_valery")
    .insert({
      empresa_id: empresa,
      tipo,
      correlativo: (archivo.name.match(/\d{4,}/) ?? [null])[0],
      nombre: archivo.name,
      ruta,
      bytes: archivo.size,
      subido_por: usuario.id,
    })
    .select("id, tipo, correlativo, nombre, ruta, bytes, fecha")
    .single();

  if (error || !data) {
    // El binario ya subió: si el índice falla, se retira. Un archivo que existe
    // y que nadie sabe que existe ocupa lugar y no sirve para nada.
    await sb.storage.from(BUCKET).remove([ruta]);
    return { ok: false, error: `No se pudo indexar: ${error?.message}` };
  }

  return { ok: true, archivo: data as ArchivoValery };
}

export async function listarArchivos(
  empresa: string,
  tipos: TipoArchivo[],
): Promise<ArchivoValery[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("archivos_valery")
    .select("id, tipo, correlativo, nombre, ruta, bytes, fecha")
    .eq("empresa_id", empresa)
    .in("tipo", tipos)
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(300);

  if (error) throw new Error(`No se pudieron leer los archivos: ${error.message}`);
  return (data ?? []) as ArchivoValery[];
}

/**
 * Un enlace temporal para abrir el PDF.
 *
 * El bucket es privado a propósito: son documentos comerciales con nombres de
 * clientes y montos. Una URL pública sería un enlace permanente a eso, para
 * cualquiera que lo tenga.
 */
export async function urlDeArchivo(ruta: string): Promise<string | null> {
  const sb = await createClient();
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(ruta, 60 * 5);
  return data?.signedUrl ?? null;
}

export async function borrarArchivo(id: number, ruta: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error: errStorage } = await sb.storage.from(BUCKET).remove([ruta]);
  if (errStorage) return { ok: false, error: errStorage.message };
  const { error } = await sb.from("archivos_valery").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
