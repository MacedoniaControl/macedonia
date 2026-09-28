import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { actualizarDesdeBcv } from "@/lib/bcv/actualizar";

// La llama la base cada 30 minutos (pg_cron + pg_net, migración 30) con la
// clave de bcv_token. Sin esa clave no hace nada: así nadie de afuera puede
// ponerla a consultar el BCV a cada rato.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function igual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const clave = req.headers.get("x-bcv-token") ?? "";
  const admin = createAdminClient();
  const { data } = await admin.from("bcv_token").select("token").eq("id", 1).maybeSingle();
  if (!clave || !data?.token || !igual(clave, data.token as string)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  const r = await actualizarDesdeBcv(admin);
  return Response.json(r, { status: r.ok ? 200 : 502 });
}
