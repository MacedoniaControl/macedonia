"use client";

// Importar cuentas desde la plantilla de Macedonia, con vista previa antes de
// escribir.
//
// Solo se admite la plantilla que se descarga aquí mismo (lib/finanzas/
// plantilla-cuentas.ts): un archivo cualquiera, aunque tenga columnas
// parecidas, se rechaza y se explica por qué. Antes se aceptaba cualquier CSV
// o Excel, y un exporte de otro sistema podía cargar un «Total» que no era el
// saldo.
//
// Muestra lo que va a entrar, lo que ya estaba en la cartera (no se vuelve a
// cargar: importar dos veces duplicaba la deuda) y lo que no entra y por qué,
// ANTES de tocar la base.

import { useState } from "react";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { Button } from "@/components/ui/Button";
import { crearCuenta, listarCuentas, type TipoCuenta } from "@/lib/finanzas/cuentas-db";
import { claveCuenta, errorDePlantilla, HOJA, HOJA_MARCA, leerPlantilla, type LecturaPlantilla } from "@/lib/finanzas/plantilla-cuentas";
import { descargarPlantilla } from "@/lib/finanzas/plantilla-cuentas-xlsx";
import { leerXlsx, hojasDe, pareceXlsx } from "@/lib/ux/xlsx";
import { fmtUsd } from "@/lib/ux/format";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";

export function ImportarCartera({
  tipo,
  empresa,
  onImportada,
}: {
  tipo: TipoCuenta;
  empresa: string;
  onImportada: () => void;
}) {
  const [lectura, setLectura] = useState<LecturaPlantilla | null>(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const t = tipo as "cobrar" | "pagar";

  async function leer(f: File) {
    setResultado(null); setError(null); setLectura(null); setNombre(f.name);
    setLeyendo(true);
    try {
      const buf = await f.arrayBuffer();
      if (!pareceXlsx(buf)) {
        return setError(`Solo se admite la plantilla de ${HOJA[t]} en Excel (.xlsx). Descárgala con «Descargar plantilla», copia ahí los datos y súbela.`);
      }
      const hojas = await hojasDe(buf);
      // La marca vive en una hoja oculta; se busca en todas por si Excel reordenó.
      let marca: string | null = null;
      for (let i = 0; i < hojas.length && !marca; i++) {
        if (hojas[i] !== HOJA_MARCA) continue;
        marca = (await leerXlsx(buf, i))[0]?.[0]?.trim() || null;
      }
      const iDatos = hojas.indexOf(HOJA[t]);
      const filasHoja = iDatos >= 0 ? await leerXlsx(buf, iDatos) : [];
      const e = errorDePlantilla(t, hojas, marca, filasHoja[0] ?? []);
      if (e) return setError(e);

      const cartera = await listarCuentas(empresa, tipo);
      const existentes = new Set(cartera.map((c) => claveCuenta(c.contraparte, c.documento)));
      setLectura(leerPlantilla(filasHoja, existentes));
    } catch (e) {
      setError(`No se pudo leer el archivo: ${(e as Error).message}`);
    } finally {
      setLeyendo(false);
    }
  }

  async function importar(cerrar: () => void) {
    if (!lectura || guardando) return;
    setGuardando(true);
    try {
      let ok = 0;
      const fallos: string[] = [];
      for (const f of lectura.filas) {
        const r = await crearCuenta({ tipo, contraparte: f.contraparte, documento: f.documento, monto: f.monto, emitida: f.emitida, vence: f.vence, nota: f.nota }, empresa);
        if (r.ok) ok++;
        else fallos.push(`${f.documento}: ${r.error}`);
      }
      onImportada();
      setResultado(
        fallos.length
          ? `${ok} cargada(s), ${fallos.length} rechazada(s) por la base: ${fallos.slice(0, 3).join(" · ")}`
          : `${ok} cuenta(s) cargadas.${lectura.repetidas.length ? ` ${lectura.repetidas.length} ya estaban en la cartera y no se tocaron.` : ""}`,
      );
      setLectura(null);
      if (!fallos.length) cerrar();
    } finally {
      setGuardando(false);
    }
  }

  const nombreEmpresa = isEmpresaId(empresa) ? EMPRESAS[empresa].nombre : empresa;

  return (
    <PildoraPanel etiqueta="Importar" icono="import" ancho="w-[30rem]">
      {(cerrar) => (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-text">Importar {HOJA[t]}</p>
            <p className="mt-0.5 text-xs text-muted">Solo se admite la plantilla de Macedonia. Descárgala, llénala y súbela.</p>
          </div>

          <Button variant="secondary" icon="report" className="w-full" onClick={() => void descargarPlantilla(t, nombreEmpresa)}>
            Descargar plantilla
          </Button>

          <input
            type="file"
            accept=".xlsx"
            aria-label="Subir la plantilla llena"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f); e.target.value = ""; }}
            className="block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-full file:border-0
                       file:bg-brand-soft file:px-4 file:text-sm file:font-medium file:text-brand"
          />
          {leyendo && <p className="text-xs text-muted">Leyendo {nombre}…</p>}

          {error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {lectura && (
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-muted">{nombre}</p>
              <p className="mt-1 text-sm text-text">
                <strong>{lectura.filas.length}</strong> cuenta(s) nuevas · {fmtUsd(lectura.filas.reduce((a, f) => a + f.monto, 0))}
              </p>

              {lectura.repetidas.length > 0 && (
                <p className="mt-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-muted">
                  {lectura.repetidas.length} ya están en la cartera y no se vuelven a cargar:{" "}
                  {lectura.repetidas.slice(0, 3).map((f) => f.documento).join(", ")}{lectura.repetidas.length > 3 ? "…" : ""}
                </p>
              )}

              {lectura.problemas.length > 0 && (
                <div className="mt-2 rounded-lg border border-warn/30 bg-warn/10 p-2">
                  <p className="text-xs font-medium text-warn">{lectura.problemas.length} fila(s) no entran:</p>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-warn">
                    {lectura.problemas.slice(0, 5).map((p, i) => <li key={i}>fila {p.linea}: {p.motivo}</li>)}
                    {lectura.problemas.length > 5 && <li>…y {lectura.problemas.length - 5} más</li>}
                  </ul>
                </div>
              )}

              {lectura.filas.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-muted">
                  {lectura.filas.slice(0, 6).map((f, i) => (
                    <li key={i}>{f.documento} · {f.contraparte} · vence {f.vence.split("-").reverse().join("-")} · {fmtUsd(f.monto)}</li>
                  ))}
                  {lectura.filas.length > 6 && <li>…y {lectura.filas.length - 6} más</li>}
                </ul>
              )}
            </div>
          )}

          {resultado && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{resultado}</p>}

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
