// app/api/inventory/lookup/route.ts
//
//   POST { codigo, empresa } -> { found, product | null, error? }
//
// Lo usa el escáner. La empresa es OBLIGATORIA: cada una tiene su catálogo y un
// mismo código puede existir en una y no en la otra, o ser un producto distinto.
//
// Un fallo de red devuelve 503 con motivo, NO un "no encontrado": para el
// operador son cosas muy distintas — una significa "revisá la etiqueta" y la
// otra "el sistema no está respondiendo".

import { NextResponse } from "next/server";
import { buscarPorCodigo } from "@/lib/inventory/catalog-db";
import { isEmpresaId } from "@/lib/ux/empresas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let codigo = "";
  let empresa = "";
  try {
    const body = await req.json();
    codigo = typeof body?.codigo === "string" ? body.codigo : "";
    empresa = typeof body?.empresa === "string" ? body.empresa : "";
  } catch {
    // body inválido -> quedan vacíos
  }

  if (!codigo.trim()) {
    return NextResponse.json(
      { found: false, product: null, error: "codigo requerido" },
      { status: 400 },
    );
  }
  if (!isEmpresaId(empresa)) {
    return NextResponse.json(
      { found: false, product: null, error: "empresa requerida (sumigases | sudematin)" },
      { status: 400 },
    );
  }

  try {
    const product = await buscarPorCodigo(codigo, empresa);
    return NextResponse.json({ found: !!product, product });
  } catch (e) {
    return NextResponse.json(
      { found: false, product: null, error: (e as Error).message },
      { status: 503 },
    );
  }
}
