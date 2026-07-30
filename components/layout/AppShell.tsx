"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { isEmpresaId } from "@/lib/ux/empresas";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Empresa activa según la URL: /admin/<empresa>/... ; si no, consolidado (sin tema).
  const m = pathname.match(/^\/admin\/(sumigases|sudematin)(\/|$)/);
  const empresa = m && isEmpresaId(m[1]) ? m[1] : null;

  return (
    <div className={`min-h-screen bg-bg ${empresa ? `theme-${empresa}` : ""}`}>
      <Sidebar empresa={empresa} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <Header onMenu={() => setSidebarOpen(true)} />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
