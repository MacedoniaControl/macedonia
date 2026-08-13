// app/api/inventory/lookup/route.ts
// Sigue el patrón de app/api/bcv/route.ts. Hoy resuelve contra el JSON en memoria;
// mañana cambias el CUERPO por una consulta a la DB sin tocar la FIRMA:
//
//   POST { codigo: string } -> { found: boolean, product: InventoryProduct | null }
//
// OJO: los alias viven en el cliente (localStorage), así que este endpoint solo
// conoce códigos Valery. Para el MVP el cliente resuelve todo con resolveScan()
// (instantáneo y offline, porque el seed ya se importa en cliente). Este endpoint
// es la "costura" para cuando el catálogo crezca / llegue la DB, momento en el que
// también moverás los alias aquí sin cambiar la firma.
import { NextResponse } from "next/server";
import { lookupByCodigo } from "@/lib/inventory/catalog";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let codigo = "";
  try {
    const body = await req.json();
    codigo = typeof body?.codigo === "string" ? body.codigo : "";
  } catch {
    // body inválido -> codigo queda ""
  }

  if (!codigo.trim()) {
    return NextResponse.json(
      { found: false, product: null, error: "codigo requerido" },
      { status: 400 },
    );
  }

  const product = lookupByCodigo(codigo);
  return NextResponse.json({ found: !!product, product: product ?? null });
}
