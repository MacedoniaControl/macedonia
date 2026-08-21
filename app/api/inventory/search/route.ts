// app/api/inventory/search/route.ts
//
//   GET ?q=<texto>&empresa=<id>  -> { results: ProductoDb[] }
//
// Lo usa el buscador de productos (typeahead). Nunca devuelve costo_unitario:
// esa columna está vetada por permiso y pedirla haría fallar la consulta entera
// para un vendedor.

import { NextResponse } from "next/server";
import { buscarProductos } from "@/lib/inventory/catalog-db";
import { isEmpresaId } from "@/lib/ux/empresas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const empresa = url.searchParams.get("empresa") ?? "";

  if (!isEmpresaId(empresa)) {
    return NextResponse.json({ results: [], error: "empresa requerida" }, { status: 400 });
  }
  if (q.trim().length < 2) return NextResponse.json({ results: [] });

  try {
    return NextResponse.json({ results: await buscarProductos(q, empresa) });
  } catch (e) {
    return NextResponse.json({ results: [], error: (e as Error).message }, { status: 503 });
  }
}
