"use server";

// Entrada y salida de sesión. Server Actions: la contraseña nunca queda en el
// bundle del navegador ni en la URL.

import { redirect } from "next/navigation";
import { createClient, createAdminClient, backendActivo } from "@/lib/supabase/server";
import { usuarioACorreo, errorDeUsuario, normalizarUsuario } from "@/lib/auth/identidad";
import { getUsuarioSesion, rutaPostLogin } from "@/lib/auth/sesion-servidor";

export type EstadoLogin = { error: string | null };

export async function entrar(_prev: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const usuario = String(form.get("usuario") ?? "");
  const password = String(form.get("password") ?? "");
  const destino = String(form.get("destino") ?? "");

  const errU = errorDeUsuario(usuario);
  if (errU) return { error: errU };
  if (!password) return { error: "Escribe tu contraseña." };

  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({
    email: usuarioACorreo(usuario),
    password,
  });

  if (error) {
    await registrarFallo(usuario);
    // Mensaje deliberadamente genérico: decir "ese usuario no existe" le confirma
    // a un atacante qué usuarios son válidos.
    return { error: "Usuario o contraseña incorrectos." };
  }

  const u = await getUsuarioSesion();
  if (!u) {
    // Existe en Auth pero no en la tabla usuarios, o está inactivo.
    await sb.auth.signOut();
    return { error: "Tu cuenta no está activa. Contacta al administrador." };
  }

  redirect(destino && destino.startsWith("/") ? destino : rutaPostLogin(u));
}

export async function salir() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}


/**
 * Deja rastro de un intento fallido y avisa al Owner a partir del tercero.
 *
 * Uno o dos fallos son un error de tecleo — alertar por eso enseña a ignorar las
 * alertas, y entonces dejan de servir justo cuando importan. Tres seguidos con
 * el mismo usuario en un cuarto de hora ya merecen saberse.
 *
 * Usa el cliente administrador porque todavía no hay sesión: nadie está
 * autenticado, así que el RLS no tiene a quién identificar.
 */
async function registrarFallo(usuario: string) {
  if (!backendActivo) return;

  try {
    const admin = createAdminClient();
    const u = normalizarUsuario(usuario);
    const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    await admin.from("auditoria").insert({
      accion: "login_fallido",
      entidad: "sesion",
      entidad_id: u,
      detalle: { usuario: u },
    });

    const { count } = await admin
      .from("auditoria")
      .select("id", { count: "exact", head: true })
      .eq("accion", "login_fallido")
      .eq("entidad_id", u)
      .gte("created_at", desde);

    if ((count ?? 0) < 3) return;

    await admin.rpc("alertar", {
      p_clave_grupo: `login-fallido:${u}`,
      p_tipo: "login_fallido",
      p_titulo: "Intentos de acceso fallidos",
      p_mensaje: `${count} intentos fallidos con el usuario "${u}" en los últimos 15 minutos.`,
      p_para_rol: "owner",
      p_empresa: null,
      p_payload: { usuario: u, intentos: count },
    });
  } catch {
    // Registrar el intento no puede impedir que la gente entre: si esto falla,
    // el login sigue funcionando igual.
  }
}
