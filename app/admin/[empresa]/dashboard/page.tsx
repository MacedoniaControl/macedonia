"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { DashboardView } from "@/app/admin/dashboard/page";
import { isEmpresaId } from "@/lib/ux/empresas";

// URLs físicamente separadas por empresa (/admin/sumigases/dashboard,
// /admin/sudematin/dashboard) servidas por un único componente compartido.
export default function EmpresaDashboardPage({ params }: { params: Promise<{ empresa: string }> }) {
  const { empresa } = use(params);
  if (!isEmpresaId(empresa)) notFound();
  return <DashboardView empresaFija={empresa} />;
}
