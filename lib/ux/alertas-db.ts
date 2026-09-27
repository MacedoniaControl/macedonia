"use server";

// Alertas de la campana y del Dashboard: solo cosas reales que piden acción,
// cada una con el enlace a donde se resuelve.
//
// Antes la campana leía una lista vacía escrita en el código y unas
// «autorizaciones» guardadas en el navegador de cada persona. Mientras tanto,
// el login ya dejaba en la base los intentos de acceso fallidos y nadie los
// veía. Ahora todo sale de la base, y cada rol ve solo lo suyo:
//
//   · Conteos del inventario por verificar ........ Owner y Administrador
//   · Conteo de Rampa por verificar ................ Owner y Administrador
//     (el Técnico ve que el suyo sigue esperando)
//   · Productos con existencia negativa ............ Owner y Administrador
//   · Clientes con cilindros hace más de 60 días ... quien opera cilindros
//   · Intentos de acceso fallidos .................. solo el Owner
//
// Cada regla va por separado: si una falla, las demás igual se muestran.

import { createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, puedeEntrarAEmpresa, sesionPuede } from "@/lib/auth/sesion-servidor";

export type Alerta = {
  id: string;
  tono: "warn" | "danger" | "info";
  titulo: string;
  mensaje: string;
  /** Dónde se resuelve. */
  enlace?: string;
  /** Solo las de seguridad: se marcan como revisadas. */
  notificacion?: number;
};

/** Días que un cliente puede tener cilindros antes de que haya que ir a buscarlos. */
const DIAS_COMODATO = 60;

async function regla(fn: () => Promise<Alerta[]>): Promise<Alerta[]> {
  try { return await fn(); } catch { return []; }
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export async function alertasDe(empresa: string): Promise<Alerta[]> {
  const u = await getUsuarioSesion();
  if (!u || !puedeEntrarAEmpresa(u, empresa)) return [];
  const sb = await createClient();
  const gerencia = u.rol === "owner" || u.rol === "admin";
  const operaCilindros = (gerencia || u.rol === "tecnico") && sesionPuede(u, "cylinders");
  const base = `/admin/${empresa}`;

  const partes = await Promise.all([
    // Conteos del inventario cerrados que esperan que alguien los certifique.
    gerencia && sesionPuede(u, "inventory") ? regla(async () => {
      const { data, error } = await sb.from("conteos").select("id, numero").eq("empresa_id", empresa)
        .eq("cerrado", true).is("eliminado_en", null).in("ajuste", ["pendiente", "sin_diferencias"]).order("id");
      if (error) throw error;
      const c = data ?? [];
      if (!c.length) return [];
      return [{
        id: "conteos-inventario", tono: "warn",
        titulo: c.length === 1 ? `Conteo ${c[0].numero} por verificar` : `${c.length} conteos del inventario por verificar`,
        mensaje: c.length === 1 ? "La existencia cambia cuando lo verificas." : `${c.map((x) => x.numero).join(", ")}. La existencia cambia cuando los verificas.`,
        enlace: `${base}/inventory?vista=conteo-historial${c.length === 1 ? `&conteo=${c[0].id}` : ""}`,
      } satisfies Alerta];
    }) : [],

    // El conteo de Rampa pendiente (hay uno a la vez por empresa).
    operaCilindros ? regla(async () => {
      const { data, error } = await sb.from("cilindros_conteos").select("numero, creado_nombre, creado_por")
        .eq("empresa_id", empresa).eq("estado", "pendiente").limit(1);
      if (error) throw error;
      const c = data?.[0];
      if (!c) return [];
      return [gerencia
        ? { id: "conteo-rampa", tono: "warn", titulo: `Conteo de Rampa ${c.numero} por verificar`,
            mensaje: `Lo contó ${c.creado_nombre}. El parque cambia cuando lo verificas.`, enlace: `${base}/cylinders?vista=historial` }
        : { id: "conteo-rampa", tono: "info",
            titulo: c.creado_por === u.id ? `Tu conteo de Rampa ${c.numero} espera verificación` : `El conteo de Rampa ${c.numero} espera verificación`,
            mensaje: "La Rampa cambia cuando el Owner o un Administrador lo verifique.", enlace: `${base}/cylinders?vista=saldos` }] satisfies Alerta[];
    }) : [],

    // Existencia negativa: salió mercancía sin que se registrara su entrada.
    // Solo los del catálogo, como el Master y el Dashboard.
    gerencia && sesionPuede(u, "inventory") ? regla(async () => {
      const { data: neg, error } = await sb.from("existencias").select("codigo").eq("empresa_id", empresa).lt("existencia", 0);
      if (error) throw error;
      const codigos = (neg ?? []).map((x) => x.codigo as string);
      let n = 0;
      for (let i = 0; i < codigos.length; i += 150) {
        const { count } = await sb.from("productos").select("codigo", { count: "exact", head: true })
          .eq("empresa_id", empresa).in("codigo", codigos.slice(i, i + 150));
        n += count ?? 0;
      }
      if (!n) return [];
      return [{
        id: "negativos", tono: "warn", titulo: `${n} producto(s) con existencia negativa`,
        mensaje: "Salió mercancía sin que se registrara su entrada. Se corrige con un conteo.", enlace: `${base}/inventory`,
      } satisfies Alerta];
    }) : [],

    // Cilindros que llevan mucho tiempo en un cliente: hay que ir a buscarlos.
    operaCilindros ? regla(async () => {
      const { data, error } = await sb.from("comodato_cliente").select("cliente, en_poder, dias")
        .eq("empresa_id", empresa).gt("dias", DIAS_COMODATO);
      if (error) throw error;
      const filas = (data ?? []).filter((x) => Number(x.en_poder) > 0);
      if (!filas.length) return [];
      const clientes = new Set(filas.map((x) => x.cliente as string));
      const cilindros = filas.reduce((a, x) => a + Number(x.en_poder), 0);
      return [{
        id: "comodato", tono: "info",
        titulo: `${clientes.size} cliente(s) con cilindros hace más de ${DIAS_COMODATO} días`,
        mensaje: `${cilindros} cilindro(s) por recuperar: ${[...clientes].slice(0, 3).join(", ")}${clientes.size > 3 ? "…" : ""}.`,
        enlace: `${base}/cylinders?vista=saldos`,
      } satisfies Alerta];
    }) : [],

    // Intentos de acceso fallidos (los escribe el login). Solo el Owner.
    u.rol === "owner" ? regla(async () => {
      const { data, error } = await sb.from("notificaciones").select("id, titulo, mensaje, veces, ultima_vez")
        .eq("estado", "pendiente").eq("tipo", "login_fallido").order("ultima_vez", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []).map((x) => ({
        id: `seguridad-${x.id}`, tono: "danger", titulo: x.titulo as string,
        mensaje: `${x.mensaje}${Number(x.veces) > 1 ? ` Se repitió ${x.veces} veces.` : ""} Último: ${fechaHora(x.ultima_vez as string)}.`,
        notificacion: Number(x.id),
      }) satisfies Alerta);
    }) : [],
  ]);
  return partes.flat();
}

/** Marca como revisada una alerta de seguridad. Si vuelve a pasar, se abre una nueva. */
export async function marcarRevisada(id: number): Promise<{ ok: boolean; error?: string }> {
  const u = await getUsuarioSesion();
  if (!u || u.rol !== "owner") return { ok: false, error: "Las alertas de seguridad las revisa el Owner." };
  const sb = await createClient();
  // El tipo de la columna no tiene «revisada»: «aprobada» es su lectura aquí.
  const { error } = await sb.from("notificaciones").update({ estado: "aprobada", resuelta_por: u.id }).eq("id", id).eq("tipo", "login_fallido");
  return error ? { ok: false, error: error.message } : { ok: true };
}
