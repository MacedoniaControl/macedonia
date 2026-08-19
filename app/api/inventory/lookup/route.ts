// app/api/inventory/lookup/route.ts
// Sigue el patrón de app/api/bcv/route.ts. Hoy resuelve contra el JSON en memoria;
// mañana cambias el CUERPO por una consulta a la DB sin tocar la FIRMA:
//
//   POST { codigo: string, empresa: EmpresaId } -> { found: boolean, product: InventoryProduct | null }
//
// La empresa es OBLIGATORIA: cada una tiene su propio catálogo de Valery y un
// código puede existir en una y no en la otra (o ser un producto distinto).
//
// OJO: los alias viven en el cliente (localStorage), así que este endpoint solo
// conoce códigos Valery. Para el MVP el cliente resuelve todo con resolveScan()
// (instantáneo y offline, porque el seed ya se importa en cliente). Este endpoint
// es la "costura" para cuando el catálogo crezca / llegue la DB, momento en el que
// también moverás los alias aquí sin cambiar la firma.
import { NextResponse } from "next/server";
import { lookupByCodigo } from "@/lib/inventory/catalog";
import { isEmpresaId } from "@/lib/ux/empresas";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let codigo = "";
  let empresa = "";
  try {
    const body = await req.json();
    codigo = typeof body?.codigo === "string" ? body.codigo : "";
    empresa = typeof body?.empresa === "string" ? body.empresa : "";
  } catch {
    // body inválido -> codigo queda ""
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

  const product = lookupByCodigo(codigo, empresa);
  return NextResponse.json({ found: !!product, product: product ?? null });
}
