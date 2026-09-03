// Traducción entre el USUARIO que la gente escribe y el CORREO que Supabase exige.
//
// DECISION: la gente entra con un usuario simple ("jose"), no con un correo.
// Seis de los diez usuarios son técnicos de recarga que entran desde el celular:
// pedirles un correo completo cada vez es fricción diaria, y varios no tienen.
//
// Supabase Auth identifica por correo, así que por dentro se le arma uno sintético
// que el usuario nunca ve ni necesita conocer.
//
// CONSECUENCIA ASUMIDA: no hay "recuperar contraseña" por correo, porque esos
// buzones no existen. La contraseña la restablece el Owner desde la app.

/** Dominio interno. No existe como buzón real y no debe existir: es solo una llave. */
export const DOMINIO_INTERNO = "macedonia.local";

/** Caracteres permitidos en un usuario: letras, números, punto, guion y guion bajo. */
const VALIDO = /^[a-z0-9._-]{3,32}$/;

/** Normaliza lo que la persona escribió: sin espacios, en minúsculas. */
export function normalizarUsuario(entrada: string): string {
  return entrada.trim().toLowerCase();
}

export function usuarioValido(usuario: string): boolean {
  return VALIDO.test(normalizarUsuario(usuario));
}

/**
 * Usuario -> correo interno.
 * Si la persona ya escribió un correo completo, se respeta tal cual: así el mismo
 * campo sirve para los dos casos sin que nadie tenga que saber cuál le tocó.
 */
export function usuarioACorreo(entrada: string): string {
  const u = normalizarUsuario(entrada);
  return u.includes("@") ? u : `${u}@${DOMINIO_INTERNO}`;
}

/** Correo interno -> usuario, para mostrarlo en pantalla sin el dominio de relleno. */
export function correoAUsuario(correo: string): string {
  const c = normalizarUsuario(correo);
  return c.endsWith(`@${DOMINIO_INTERNO}`) ? c.slice(0, -(DOMINIO_INTERNO.length + 1)) : c;
}

/** Mensaje de error para el formulario, o null si el usuario sirve. */
export function errorDeUsuario(entrada: string): string | null {
  const u = normalizarUsuario(entrada);
  if (!u) return "Escribe tu usuario.";
  if (u.includes("@")) return null; // es un correo: lo valida Supabase
  if (u.length < 3) return "El usuario debe tener al menos 3 caracteres.";
  if (u.length > 32) return "El usuario es demasiado largo.";
  if (!VALIDO.test(u)) return "Solo letras, números, punto, guion y guion bajo.";
  return null;
}

/**
 * Iniciales para el chip de sesion. Toma la primera letra de las dos primeras
 * palabras: "Administracion PLC" -> "AP".
 *
 * Con una sola palabra usa sus DOS primeras letras. Una inicial sola no
 * distingue a nadie: Angie y Almacen serian las dos una "A".
 *
 * Vive aca y no en el componente porque es una funcion pura, y Node no puede
 * cargar un .tsx para probarla.
 */
export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}
