"use server";

// Entrada y salida de sesión. Server Actions: la contraseña nunca queda en el
// bundle del navegador ni en la URL.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { usuarioACorreo, errorDeUsuario } from "@/lib/auth/identidad";
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
