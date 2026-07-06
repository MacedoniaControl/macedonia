"use client";

import { useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";

const PASOS = [
  { n: 1, label: "Subir archivo", detalle: "MATRIZ DE VENTAS ABRIL 2024.xlsx cargado (355 filas)." },
  { n: 2, label: "Detectar hojas", detalle: "7 hojas detectadas: TOTALES, RESUMEN, FACTURAS, NOTAS DE ENTREGA…" },
  { n: 3, label: "Clasificar hoja", detalle: "Hoja NOTAS DE ENTREGA clasificada como “Ventas / documentos”." },
  { n: 4, label: "Mapear columnas", detalle: "12 columnas mapeadas (cliente, producto, código, tasa, costo, utilidad)." },
  { n: 5, label: "Vista previa", detalle: "Primeras 50 filas validadas visualmente." },
  { n: 6, label: "Validar errores", detalle: "338 válidas · 17 con error · 4 duplicados · 9 productos y 3 clientes sin equivalencia." },
  { n: 7, label: "Importar", detalle: "338 filas importadas en lote imp-2026-06-23." },
  { n: 8, label: "Resultado", detalle: "KPIs actualizados. Reversión disponible solo para OWNER/ADMIN." },
];

const resumen = [
  { label: "Filas detectadas", value: "355" },
  { label: "Filas válidas", value: "338" },
  { label: "Filas con error", value: "17" },
  { label: "Duplicados", value: "4" },
  { label: "Total ventas", value: "$23.888" },
  { label: "Total utilidad", value: "$8.035" },
  { label: "Total crédito", value: "$0" },
  { label: "Total contado", value: "$23.888" },
];

export default function ImportsPage() {
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState("MATRIZ DE VENTAS ABRIL 2024.xlsx");
  const fileRef = useRef<HTMLInputElement>(null);
  const done = paso > PASOS.length;

  return (
    <>
      <PageHeader
        title="Importaciones"
        description="Flujo guiado interactivo para Excel / Valery / Profit. Avanza los pasos para simular una importación real."
        breadcrumbs={[{ label: "Inventario" }, { label: "Importaciones" }]}
        actions={
          done
            ? <StatusBadge tone="ok">Importación completada</StatusBadge>
            : <StatusBadge tone="brand">Paso {paso} de {PASOS.length}</StatusBadge>
        }
      />

      <SectionCard
        title="Asistente de importación"
        description={`${archivo} · hoja “NOTAS DE ENTREGA”`}
        action={
          <div className="flex gap-2">
            {!done && paso === 1 && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" aria-label="Subir archivo"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setArchivo(f.name); setPaso(2); } }} />
                <Button icon="upload" onClick={() => fileRef.current?.click()}>Subir archivo</Button>
              </>
            )}
            {!done && paso > 1 && <Button icon="check" onClick={() => setPaso((p) => p + 1)}>{`Completar paso ${paso}`}</Button>}
            {paso > 1 && <Button variant="secondary" onClick={() => setPaso(1)}>Reiniciar</Button>}
          </div>
        }
      >
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PASOS.map((s) => {
            const estado = s.n < paso ? "done" : s.n === paso && !done ? "current" : "pending";
            return (
              <li key={s.n}
                className={`rounded-xl border p-3 ${estado === "current" ? "border-brand bg-brand-soft" : estado === "done" ? "border-border bg-surface-2" : "border-dashed border-border"}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${estado === "done" ? "bg-ok text-white" : estado === "current" ? "bg-brand text-white" : "bg-surface text-muted"}`}>
                    {estado === "done" ? "✓" : s.n}
                  </span>
                  <span className={`text-sm ${estado === "current" ? "font-medium text-brand" : "text-text"}`}>{s.label}</span>
                </div>
                {estado !== "pending" && <p className="mt-1.5 text-xs text-muted">{s.detalle}</p>}
              </li>
            );
          })}
        </ol>
      </SectionCard>

      {paso >= 6 && (
        <div className="mt-6">
          <SectionCard
            title="Resumen detectado"
            description="Validación previa a la confirmación."
            action={<StatusBadge tone={done ? "ok" : "warn"}>{done ? "338 importadas" : "17 con error"}</StatusBadge>}
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {resumen.map((r) => <StatCard key={r.label} label={r.label} value={r.value} />)}
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li>• 9 productos sin equivalencia → crear en ProductAlias.</li>
              <li>• 3 clientes sin equivalencia → crear en CustomerAlias.</li>
              <li>• 4 documentos duplicados por correlativo (excluidos).</li>
            </ul>
            {done && (
              <p className="mt-4 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">
                Lote imp-2026-06-23 importado. Dashboard y reportes actualizados. La reversión queda disponible solo para OWNER/ADMIN.
              </p>
            )}
          </SectionCard>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Demo client-side del flujo §15 del planning (mapeo, validación, equivalencias, lote y reversión).</p>
    </>
  );
}
