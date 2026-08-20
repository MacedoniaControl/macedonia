"use server";

// Alta y gestión de usuarios. SOLO EL OWNER.
//
// Estas acciones usan el cliente administrador, que SE SALTA EL RLS por completo
// (crear una cuenta en Auth exige ese nivel). Por eso cada una comprueba el rol
// A MANO antes de tocar nada: aquí la base no nos protege, nos protegemos nosotros.
//
// Regla de negocio: solo el Owner. Ni siquiera los administradores.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import { usuarioACorreo, errorDeUsuario, correoAUsuario } from "@/lib/auth/identidad";
import { isEmpresaId } from "@/lib/ux/empresas";

export type Resultado = { error: string | null; ok: string | null };

const ROLES_VALIDOS = ["owner", "admin", "vendedor", "tecnico"] as const;
type RolValido = (typeof ROLES_VALIDOS)[number];

/** Portero. Toda acción de este archivo empieza por aquí. */
async function exigirOwner() {
  const u = await getUsuarioSesion();
  if (!u) throw new Error("Sin sesión.");
  if (u.rol !== "owner") throw new Error("Solo el Owner puede gestionar usuarios.");
  return u;
}

export type UsuarioFila = {
  id: string;
  nombre: string;
  usuario: string;
  rol: string;
  empresaId: string | null;
  activo: boolean;
};

export async function listarUsuarios(): Promise<UsuarioFila[]> {
  await exigirOwner();
  const admin = createAdminClient();

  const { data: filas } = await admin
    .from("usuarios")
    .select("id, nombre, rol, empresa_id, activo")
    .order("nombre");
  if (!filas) return [];

  // El "usuario" con el que entra cada quien vive en Auth, no en la tabla.
  const { data: auth } = await admin.auth.admin.listUsers({ perPage: 200 });
  const correos = new Map((auth?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    usuario: correoAUsuario(correos.get(f.id) ?? ""),
    rol: f.rol,
    empresaId: f.empresa_id,
    activo: f.activo,
  }));
}

export async function crearUsuario(_prev: Resultado, form: FormData): Promise<Resultado> {
  try {
    await exigirOwner();
  } catch (e) {
    return { error: (e as Error).message, ok: null };
  }

  const nombre = String(form.get("nombre") ?? "").trim();
  const usuario = String(form.get("usuario") ?? "");
  const password = String(form.get("password") ?? "");
  const rol = String(form.get("rol") ?? "") as RolValido;
  const empresaRaw = String(form.get("empresa") ?? "");

  if (!nombre) return { error: "Escribe el nombre de la persona.", ok: null };
  const errU = errorDeUsuario(usuario);
  if (errU) return { error: errU, ok: null };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres.", ok: null };
  if (!ROLES_VALIDOS.includes(rol)) return { error: "Rol inválido.", ok: null };

  // El owner ve todas las empresas; los demás DEBEN tener una asignada, o el RLS
  // los dejaría sin acceso a nada y parecería que la app está rota.
  const empresaId = rol === "owner" ? null : empresaRaw;
  if (rol !== "owner" && !isEmpresaId(empresaId ?? "")) {
    return { error: "Elige la empresa a la que pertenece.", ok: null };
  }

  const admin = createAdminClient();
  const correo = usuarioACorreo(usuario);

  const { data: creado, error: errAuth } = await admin.auth.admin.createUser({
    email: correo,
    password,
    // Se confirma solo: el buzón no existe, es un correo interno.
    email_confirm: true,
  });

  if (errAuth || !creado?.user) {
    const msg = errAuth?.message ?? "";
    if (/already|registered|exists/i.test(msg)) {
      return { error: `El usuario "${usuario}" ya existe.`, ok: null };
    }
    return { error: `No se pudo crear: ${msg}`, ok: null };
  }

  const { error: errFila } = await admin.from("usuarios").insert({
    id: creado.user.id,
    nombre,
    rol,
    empresa_id: empresaId,
    activo: true,
  });

  if (errFila) {
    // Sin la fila en `usuarios` la cuenta no sirve para nada y quedaría huérfana
    // en Auth: se deshace para no dejar basura ni cuentas fantasma.
    await admin.auth.admin.deleteUser(creado.user.id);
    return { error: `No se pudo guardar el perfil: ${errFila.message}`, ok: null };
  }

  revalidatePath("/admin/users");
  return { error: null, ok: `Usuario "${usuario}" creado. Entrégale la contraseña en persona.` };
}

export async function cambiarActivo(id: string, activo: boolean): Promise<Resultado> {
  try {
    const yo = await exigirOwner();
    if (yo.id === id) return { error: "No puedes desactivarte a ti mismo.", ok: null };
  } catch (e) {
    return { error: (e as Error).message, ok: null };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("usuarios").update({ activo }).eq("id", id);
  if (error) return { error: error.message, ok: null };

  revalidatePath("/admin/users");
  return { error: null, ok: activo ? "Usuario reactivado." : "Usuario desactivado: ya no puede entrar." };
}

export async function restablecerPassword(id: string, nueva: string): Promise<Resultado> {
  try {
    await exigirOwner();
  } catch (e) {
    return { error: (e as Error).message, ok: null };
  }
  if (nueva.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres.", ok: null };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: nueva });
  if (error) return { error: error.message, ok: null };

  return { error: null, ok: "Contraseña restablecida. Entrégala en persona." };
}
