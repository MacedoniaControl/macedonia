import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isEmpresaId } from "@/lib/ux/empresas";

// Valida la empresa una sola vez para todas las rutas /admin/<empresa>/*.
// El tema y el nav por empresa los aplica AppShell (según la URL).
export default async function EmpresaLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ empresa: string }>;
}) {
  const { empresa } = await params;
  if (!isEmpresaId(empresa)) notFound();
  return children;
}
