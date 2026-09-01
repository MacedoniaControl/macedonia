"use client";

// Importar cartera desde un archivo, con vista previa antes de escribir.
//
// Muestra lo que va a entrar y lo que no, y por qué, ANTES de tocar la base.
// Una importación que escribe primero y avisa después deja la cartera sucia y
// nadie sabe qué fila arreglar.

import { useState } from "react";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { Button } from "@/components/ui/Button";
import { crearCuenta, type TipoCuenta } from "@/lib/finanzas/cuentas-db";
import { leerCartera, type Lectura } from "@/lib/finanzas/importar-cuentas";
import { fmtUsd } from "@/lib/ux/format";

export function ImportarCartera({
  tipo,
  empresa,
  onImportada,
}: {
  tipo: TipoCuenta;
  empresa: string;
  onImportada: () => void;
}) {
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function leer(f: File) {
    setResultado(null);
    setNombre(f.name);
    setLectura(leerCartera(await f.text()));
  }

  async function importar(cerrar: () => void) {
    if (!lectura || guardando) return;
    setGuardando(true);
    try {
      let ok = 0;
      const fallos: string[] = [];
      for (const f of lectura.filas) {
        const r = await crearCuenta({ tipo, ...f }, empresa);
        if (r.ok) ok++;
        else fallos.push(`${f.documento}: ${r.error}`);
      }
      onImportada();
      setResultado(
        fallos.length
          ? `${ok} cargada(s), ${fallos.length} rechazada(s) por la base: ${fallos.slice(0, 3).join(" · ")}`
          : `${ok} cuenta(s) cargadas.`,
      );
      setLectura(null);
      if (!fallos.length) cerrar();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PildoraPanel etiqueta="Importar" icono="import" ancho="w-[30rem]">
      {(cerrar) => (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-text">Importar cartera</p>

          <input
            type="file"
            accept=".csv,.txt,.tsv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f); }}
            className="block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-full file:border-0
                       file:bg-brand-soft file:px-4 file:text-sm file:font-medium file:text-brand"
          />

          <p className="text-[11px] text-muted">
            Necesita las columnas <strong>{tipo === "cobrar" ? "Cliente" : "Proveedor"}</strong>,{" "}
            <strong>Documento</strong> y <strong>Monto</strong>. «Vence» es opcional.
            Desde Excel: Guardar como → CSV.
          </p>

          {lectura && (
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-muted">{nombre}</p>
              <p className="mt-1 text-sm text-text">
                <strong>{lectura.filas.length}</strong> fila(s) listas ·{" "}
                {fmtUsd(lectura.filas.reduce((a, f) => a + f.monto, 0))}
              </p>

              {lectura.problemas.length > 0 && (
                <div className="mt-2 rounded-lg border border-warn/30 bg-warn/10 p-2">
                  <p className="text-xs font-medium text-warn">
                    {lectura.problemas.length} fila(s) no entran:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-warn">
                    {lectura.problemas.slice(0, 5).map((p, i) => (
                      <li key={i}>línea {p.linea}: {p.motivo}</li>
                    ))}
                    {lectura.problemas.length > 5 && <li>…y {lectura.problemas.length - 5} más</li>}
                  </ul>
                </div>
              )}

              {lectura.filas.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-muted">
                  {lectura.filas.slice(0, 6).map((f, i) => (
                    <li key={i}>{f.documento} · {f.contraparte} · {fmtUsd(f.monto)}</li>
                  ))}
                  {lectura.filas.length > 6 && <li>…y {lectura.filas.length - 6} más</li>}
                </ul>
              )}
            </div>
          )}

          {resultado && (
            <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{resultado}</p>
          )}

          <div className="flex gap-2">
            <Button icon="import" className="flex-1" disabled={guardando || !lectura?.filas.length}
              onClick={() => importar(cerrar)}>
              {guardando ? "Cargando…" : `Importar ${lectura?.filas.length ?? 0}`}
            </Button>
            <Button variant="secondary" onClick={cerrar}>Cerrar</Button>
          </div>
        </div>
      )}
    </PildoraPanel>
  );
}
