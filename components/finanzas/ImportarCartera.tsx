"use client";

// Importar cuentas, con vista previa antes de escribir.
//
// Se admiten dos cosas, en .xls o .xlsx, y nada más:
//   · el reporte de Valery tal como sale: «Estado de Cuenta de Clientes» (por
//     cobrar) o «Relación de Cuentas por Pagar a Proveedores» (por pagar).
//     Es lo que se sube para actualizar la cartera (lib/finanzas/valery-cuentas.ts);
//   · la plantilla de Macedonia (lib/finanzas/plantilla-cuentas.ts).
// Cualquier otro archivo se rechaza y se explica por qué.
//
// Antes de tocar la base muestra lo que va a entrar, y CADA cuenta que ya está
// en la cartera (no se vuelve a cargar: importar dos veces duplicaba la deuda),
// con su saldo en la cartera. El archivo se puede soltar sobre el botón.

import { useState } from "react";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { Button } from "@/components/ui/Button";
import { crearCuenta, listarCuentas, type TipoCuenta } from "@/lib/finanzas/cuentas-db";
import { errorDePlantilla, HOJA, HOJA_MARCA, leerPlantilla, type FilaPlantilla } from "@/lib/finanzas/plantilla-cuentas";
import { errorDeValery, esValery, leerValery, separarDuplicadas, type Celda, type Duplicada, type HojaLeida } from "@/lib/finanzas/valery-cuentas";
import type { ClaseCuenta } from "@/lib/finanzas/retencion";
import { descargarPlantilla } from "@/lib/finanzas/plantilla-cuentas-xlsx";
import { leerXlsx, hojasDe, pareceXlsx } from "@/lib/ux/xlsx";
import { hojasXls, leerXls, pareceXls } from "@/lib/ux/xls";
import { fmtUsd } from "@/lib/ux/format";
import { EMPRESAS, isEmpresaId } from "@/lib/ux/empresas";
import { SelectorVendedor, VALOR_PROPIA } from "@/components/finanzas/VendedorCartera";

type Fila = FilaPlantilla & { clase?: ClaseCuenta; linea?: number };
type Lectura = {
  origen: "valery" | "plantilla";
  nuevas: Fila[];
  duplicadas: Duplicada<Fila>[];
  enArchivo: { fila: Fila; primera: Fila }[];
  problemas: { linea: number; motivo: string }[];
  enCero: number;
  sinVencimiento: number;
  sinNumero: number;
};

const dmy = (iso: string) => iso.split("-").reverse().join("-");

/** Todas las hojas del archivo, sea .xls (Excel 97-2003, como exporta Valery) o .xlsx. */
async function hojasDelArchivo(buf: ArrayBuffer): Promise<HojaLeida[] | null> {
  if (pareceXls(buf)) return hojasXls(buf).map((nombre, i) => ({ nombre, filas: leerXls(buf, i) }));
  if (pareceXlsx(buf)) {
    const nombres = await hojasDe(buf);
    return Promise.all(nombres.map(async (nombre, i) => ({ nombre, filas: (await leerXlsx(buf, i)) as Celda[][] })));
  }
  return null;
}

export function ImportarCartera({
  tipo,
  empresa,
  onImportada,
  vendedores = [],
}: {
  tipo: TipoCuenta;
  empresa: string;
  onImportada: () => void;
  /** Por cobrar: los vendedores externos conocidos, para decir de quién es la cartera que se sube. */
  vendedores?: string[];
}) {
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  // "" = cada cuenta sigue a su cliente; propia o un vendedor externo = todas a esa cartera.
  const [cartera, setCartera] = useState("");
  const t = tipo as "cobrar" | "pagar";
  const reporte = t === "cobrar" ? "Estado de Cuenta de Clientes" : "Relación de Cuentas por Pagar a Proveedores";

  async function leer(f: File) {
    setResultado(null); setError(null); setLectura(null); setNombre(f.name);
    setLeyendo(true);
    try {
      const buf = await f.arrayBuffer();
      const hojas = await hojasDelArchivo(buf);
      if (!hojas) return setError(`Solo se admite Excel (.xls o .xlsx): el reporte «${reporte}» de Valery o la plantilla de Macedonia.`);

      let filas: Fila[];
      let base: Omit<Lectura, "nuevas" | "duplicadas" | "enArchivo">;
      if (esValery(hojas)) {
        const e = errorDeValery(t, hojas);
        if (e) return setError(e);
        const l = leerValery(t, hojas);
        filas = l.filas;
        base = { origen: "valery", problemas: l.problemas, enCero: l.enCero, sinVencimiento: l.sinVencimiento, sinNumero: l.sinNumero };
      } else {
        // La plantilla: la marca vive en una hoja oculta.
        const marcaHoja = hojas.find((h) => h.nombre === HOJA_MARCA);
        const marca = marcaHoja ? String(marcaHoja.filas[0]?.[0] ?? "").trim() || null : null;
        const datos = hojas.find((h) => h.nombre === HOJA[t]);
        const filasHoja = (datos?.filas ?? []).map((r) => r.map((c) => (c === null ? "" : String(c))));
        const e = errorDePlantilla(t, hojas.map((h) => h.nombre), marca, filasHoja[0] ?? []);
        if (e) {
          return setError(marca || datos
            ? e
            : `Este archivo no es el reporte «${reporte}» de Valery ni la plantilla de Macedonia. Sube el reporte tal como sale de Valery (.xls o .xlsx).`);
        }
        const l = leerPlantilla(filasHoja, new Set());
        filas = l.filas;
        base = { origen: "plantilla", problemas: l.problemas, enCero: 0, sinVencimiento: 0, sinNumero: 0 };
      }

      // Lo que ya está en la cartera, de importaciones anteriores o cargado a mano.
      // El saldo NETO (sin la retención), que es como lo da Valery: así solo se marca lo que de verdad cambió.
      const cartera = (await listarCuentas(empresa, tipo)).map((c) => ({ ...c, saldo: c.saldoNeto ?? c.saldo }));
      const s = separarDuplicadas(filas, cartera);
      setLectura({ ...base, ...s });
      if (!filas.length && !base.problemas.length) setError("El archivo no trae cuentas con saldo.");
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
      for (const f of lectura.nuevas) {
        const r = await crearCuenta({
          tipo, contraparte: f.contraparte, documento: f.documento, monto: f.monto, emitida: f.emitida, vence: f.vence, nota: f.nota,
          // De quién es la cartera: sin elegir, cada cuenta sigue a su cliente (o a su nota de Macedonia).
          ...(tipo === "cobrar" && cartera !== "" ? { vendedorExterno: cartera === VALOR_PROPIA ? null : cartera.trim() } : {}),
          // Del reporte de Valery el saldo ya viene sin la retención: no se vuelve a calcular.
          ...(lectura.origen === "valery" ? { clase: f.clase, aplicaRetencion: false } : {}),
        }, empresa);
        if (r.ok) ok++;
        else fallos.push(`${f.documento}: ${r.error}`);
      }
      onImportada();
      const rep = lectura.duplicadas.length + lectura.enArchivo.length;
      setResultado(
        fallos.length
          ? `${ok} cargada(s), ${fallos.length} rechazada(s) por la base: ${fallos.slice(0, 3).join(" · ")}`
          : `${ok} cuenta(s) cargadas.${rep ? ` ${rep} duplicada(s) no se tocaron.` : ""}`,
      );
      setLectura(null);
      if (!fallos.length) cerrar();
    } finally {
      setGuardando(false);
    }
  }

  // Soltar un archivo: sobre el botón (lo abre) o dentro del panel.
  const soltar = (e: React.DragEvent) => {
    e.preventDefault(); setEncima(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void leer(f);
  };
  const arrastrando = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setEncima(true); },
    onDragLeave: () => setEncima(false),
  };

  const nombreEmpresa = isEmpresaId(empresa) ? EMPRESAS[empresa].nombre : empresa;
  const total = (lectura?.nuevas ?? []).reduce((a, f) => a + f.monto, 0);

  return (
    <PildoraPanel etiqueta="Importar" icono="import" ancho="w-[34rem]" onSoltarArchivo={(f) => void leer(f)}>
      {(cerrar) => (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-text">Importar {HOJA[t]}</p>
            <p className="mt-0.5 text-xs text-muted">
              Sube el reporte «{reporte}» tal como sale de Valery, en .xls o .xlsx. También se admite la plantilla de Macedonia.
            </p>
          </div>

          <label {...arrastrando} onDrop={soltar}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-5 text-center transition
              ${encima ? "border-brand bg-brand-soft" : "border-border-strong bg-surface-2 hover:bg-surface"}`}>
            <span className="text-sm font-medium text-text">{leyendo ? `Leyendo ${nombre}…` : "Suelta aquí el archivo"}</span>
            <span className="text-xs text-muted">o haz clic para elegirlo</span>
            <input type="file" accept=".xls,.xlsx" className="sr-only" aria-label={`Subir el reporte de ${HOJA[t]}`}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f); e.target.value = ""; }} />
          </label>

          {error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          {lectura && (
            <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-muted">{nombre} · {lectura.origen === "valery" ? `reporte de Valery` : "plantilla de Macedonia"} · {nombreEmpresa}</p>
              <p className="text-sm text-text">
                <strong>{lectura.nuevas.length}</strong> cuenta(s) nuevas · {fmtUsd(total)}
              </p>

              {lectura.duplicadas.length > 0 && (
                <div className="rounded-lg border border-warn/30 bg-warn/10 p-2">
                  <p className="text-xs font-semibold text-warn">
                    {lectura.duplicadas.length} cuenta(s) duplicada(s): ya están en la cartera y no se vuelven a cargar.
                  </p>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-warn">
                    {lectura.duplicadas.map((d, i) => (
                      <li key={i}>
                        <b>{d.fila.documento}</b> · {d.fila.contraparte} · en el archivo {fmtUsd(d.fila.monto)} · en la cartera «{d.existente.documento}» de {d.existente.contraparte}, saldo {fmtUsd(d.existente.saldo)}
                        {Math.abs(d.existente.saldo - d.fila.monto) > 1 ? " (el saldo cambió: revísalo a mano)" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {lectura.enArchivo.length > 0 && (
                <div className="rounded-lg border border-warn/30 bg-warn/10 p-2">
                  <p className="text-xs font-semibold text-warn">{lectura.enArchivo.length} cuenta(s) repetidas dentro del mismo archivo (entra una sola vez):</p>
                  <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-warn">
                    {lectura.enArchivo.map((d, i) => <li key={i}><b>{d.fila.documento}</b> · {d.fila.contraparte} · {fmtUsd(d.fila.monto)}</li>)}
                  </ul>
                </div>
              )}

              {lectura.problemas.length > 0 && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-2">
                  <p className="text-xs font-medium text-danger">{lectura.problemas.length} fila(s) no entran:</p>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-danger">
                    {lectura.problemas.slice(0, 5).map((p, i) => <li key={i}>fila {p.linea}: {p.motivo}</li>)}
                    {lectura.problemas.length > 5 && <li>…y {lectura.problemas.length - 5} más</li>}
                  </ul>
                </div>
              )}

              {(lectura.enCero > 0 || lectura.sinVencimiento > 0 || lectura.sinNumero > 0) && (
                <p className="text-[11px] text-muted">
                  {lectura.enCero > 0 && `${lectura.enCero} documento(s) con saldo 0 no se cargan. `}
                  {lectura.sinVencimiento > 0 && `${lectura.sinVencimiento} sin fecha de vencimiento en Valery: se cargan con vencimiento el día de emisión. `}
                  {lectura.sinNumero > 0 && `${lectura.sinNumero} sin número de documento en Valery (saldos viejos): se cargan como «S/N» con su fecha.`}
                </p>
              )}

              {lectura.nuevas.length > 0 && (
                <ul className="max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-muted">
                  {lectura.nuevas.slice(0, 8).map((f, i) => (
                    <li key={i}>{f.documento} · {f.contraparte} · vence {dmy(f.vence)} · {fmtUsd(f.monto)}</li>
                  ))}
                  {lectura.nuevas.length > 8 && <li>…y {lectura.nuevas.length - 8} más</li>}
                </ul>
              )}
            </div>
          )}

          {tipo === "cobrar" && lectura?.nuevas.length ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">¿De quién es esta cartera?</span>
              <SelectorVendedor id="imp-cartera" vendedores={vendedores} valor={cartera} onCambio={setCartera}
                propiaLabel={`Cartera propia de ${nombreEmpresa}`} extra={[{ id: "", label: "Según cada cliente" }]} />
              <span className="mt-1 block text-[11px] text-muted">Con un vendedor externo, sus clientes sin vendedor quedan asignados a él.</span>
            </label>
          ) : null}

          {resultado && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{resultado}</p>}

          <div className="flex flex-wrap gap-2">
            <Button icon="import" className="flex-1" disabled={guardando || !lectura?.nuevas.length}
              onClick={() => importar(cerrar)}>
              {guardando ? "Cargando…" : `Importar ${lectura?.nuevas.length ?? 0}`}
            </Button>
            <Button variant="secondary" onClick={cerrar}>Cerrar</Button>
          </div>
          <button type="button" className="text-xs text-muted underline-offset-2 hover:underline"
            onClick={() => void descargarPlantilla(t, nombreEmpresa)}>
            ¿Sin Valery a mano? Descarga la plantilla de Macedonia
          </button>
        </div>
      )}
    </PildoraPanel>
  );
}
