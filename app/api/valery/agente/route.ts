import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

// La puerta del agente del Puente Valery (docs/decisions/puente-valery.md).
//
// El agente vive en el servidor del cliente y solo habla hacia afuera: pregunta
// aquí si hay algo pedido para su empresa y entrega lo que leyó. Se identifica
// con la clave que se generó en el panel; la base guarda solo su huella.
// Sin clave válida, nada. Con clave, solo los pedidos de SU empresa.
//
// No pasa por el proxy de sesión (proxy.ts lo excluye): el agente no tiene
// usuario. Por eso todo lo que hace aquí se comprueba a mano.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const huella = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const noAutorizado = () => Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
const malo = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

// Un pedido que el agente tomó y no terminó en 15 minutos se da por perdido
// (se apagó el servidor, se cortó la red): el panel deja pedirlo de nuevo.
const PERDIDO_MS = 15 * 60_000;
// Una parte de resultado no puede ser enorme: el agente manda de a 1.000 filas.
const MAX_FILAS_PARTE = 5000;

type Cuerpo =
  | { accion: "siguiente"; version?: string; info?: Record<string, unknown> }
  | { accion: "resultado"; solicitud: number; parte: number; total: number; datos: unknown[]; resumen?: Record<string, unknown> }
  | { accion: "error"; solicitud: number; mensaje: string };

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token.length < 32 || token.length > 200) return noAutorizado();

  const admin = createAdminClient();
  const { data: agente } = await admin.from("valery_agentes").select("id, empresa_id, info")
    .eq("token_hash", huella(token)).is("revocado_en", null).maybeSingle();
  if (!agente) return noAutorizado();
  const empresa = agente.empresa_id as string;

  let cuerpo: Cuerpo;
  try { cuerpo = (await req.json()) as Cuerpo; } catch { return malo("El cuerpo no es JSON."); }

  if (cuerpo.accion === "siguiente") {
    const info = cuerpo.info && typeof cuerpo.info === "object" ? cuerpo.info : {};
    await admin.from("valery_agentes").update({
      ultimo_contacto: new Date().toISOString(),
      version: typeof cuerpo.version === "string" ? cuerpo.version.slice(0, 40) : null,
      info: { ...((agente.info as Record<string, unknown>) ?? {}), ...info },
    }).eq("id", agente.id);

    await admin.from("valery_solicitudes").update({
      estado: "error", terminado_en: new Date().toISOString(),
      error: "El agente tomó el pedido y no lo terminó en 15 minutos. Pídelo de nuevo.",
    }).eq("empresa_id", empresa).eq("estado", "en_proceso").lt("tomado_en", new Date(Date.now() - PERDIDO_MS).toISOString());

    const { data: pendiente } = await admin.from("valery_solicitudes").select("id, tipo, parametros")
      .eq("empresa_id", empresa).eq("estado", "pendiente").order("id").limit(1).maybeSingle();
    if (!pendiente) return Response.json({ ok: true, solicitud: null });
    // Se toma solo si sigue pendiente: dos agentes (o dos vueltas) no toman el mismo.
    const { data: tomada } = await admin.from("valery_solicitudes")
      .update({ estado: "en_proceso", tomado_en: new Date().toISOString() })
      .eq("id", pendiente.id).eq("estado", "pendiente").select("id").maybeSingle();
    return Response.json({ ok: true, solicitud: tomada ? pendiente : null });
  }

  if (cuerpo.accion === "resultado" || cuerpo.accion === "error") {
    const id = Number(cuerpo.solicitud);
    if (!Number.isInteger(id) || id <= 0) return malo("Falta la solicitud.");
    const { data: s } = await admin.from("valery_solicitudes").select("id, estado")
      .eq("id", id).eq("empresa_id", empresa).maybeSingle();
    if (!s) return malo("Esa solicitud no es de esta empresa.", 404);
    if (s.estado !== "en_proceso") return malo(`La solicitud ya está ${s.estado}.`, 409);

    if (cuerpo.accion === "error") {
      await admin.from("valery_solicitudes").update({
        estado: "error", terminado_en: new Date().toISOString(), error: String(cuerpo.mensaje ?? "Error sin detalle.").slice(0, 2000),
      }).eq("id", id);
      return Response.json({ ok: true });
    }

    const parte = Number(cuerpo.parte), total = Number(cuerpo.total);
    if (!Number.isInteger(parte) || !Number.isInteger(total) || parte < 1 || total < 1 || parte > total || total > 10_000) return malo("Parte inválida.");
    if (!Array.isArray(cuerpo.datos) || cuerpo.datos.length > MAX_FILAS_PARTE) return malo("Los datos tienen que ser una lista de hasta 5.000 filas.");
    const { error: e1 } = await admin.from("valery_resultados").upsert({ solicitud_id: id, parte, datos: cuerpo.datos });
    if (e1) return malo(`No se pudo guardar la parte ${parte}: ${e1.message}`, 500);
    if (parte === total) {
      const { count } = await admin.from("valery_resultados").select("parte", { count: "exact", head: true }).eq("solicitud_id", id);
      if ((count ?? 0) !== total) return malo(`Faltan partes: llegaron ${count ?? 0} de ${total}.`, 409);
      await admin.from("valery_solicitudes").update({
        estado: "lista", terminado_en: new Date().toISOString(), partes: total,
        resumen: cuerpo.resumen && typeof cuerpo.resumen === "object" ? cuerpo.resumen : null,
      }).eq("id", id);
    }
    return Response.json({ ok: true });
  }

  return malo("Acción desconocida.");
}
