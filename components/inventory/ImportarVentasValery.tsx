"use client";

// Importar las ventas de Valery al inventario, con vista previa antes de tocar
// la base.
//
// Solo se admite la «Relación de Ventas Diarias (Detallado por Renglón)» de
// Valery, en sus dos formatos (completo y agrupado por documento), como sale:
// .xls (Excel 97-2003) o .xlsx si se guardó así. Cualquier otro archivo se
// rechaza y se explica por qué. Las reglas están en lib/inventory/ventas-valery.ts.

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { leerXls, pareceXls } from "@/lib/ux/xls";
import { leerXlsx, pareceXlsx } from "@/lib/ux/xlsx";
import { errorDeVentas, facturasAjenas, leerVentas, planVentas, SERIE_FAC, type Celda, type LecturaVentas, type PlanVentas } from "@/lib/inventory/ventas-valery";
import { corteVentas, deshacerImportacionVentas, importacionesVentas, importarVentasValery, type ImportacionVentas } from "@/lib/inventory/ventas-valery-db";

const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "—");
const n = (x: number) => x.toLocaleString("es-VE");
const restarDias = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - d * 86400000).toISOString().slice(0, 10);

async function huella(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Vista = { nombre: string; hash: string; lectura: LecturaVentas; plan: PlanVentas };

export function ImportarVentasValery({ empresa, onImportada }: { empresa: string; onImportada: () => void }) {
  const [corte, setCorte] = useState<string | null | undefined>(undefined);
  const [vista, setVista] = useState<Vista | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [lista, setLista] = useState<ImportacionVentas[]>([]);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    corteVentas(empresa).then((c) => { if (vigente) setCorte(c); }).catch((e) => { if (vigente) { setCorte(null); setError((e as Error).message); } });
    importacionesVentas(empresa).then((l) => { if (vigente) setLista(l); }).catch(() => {});
    return () => { vigente = false; };
  }, [empresa, recarga]);

  const nombreEmpresa = SERIE_FAC[empresa]?.nombre ?? empresa;

  async function leer(f: File) {
    setVista(null); setError(null); setHecho(null); setLeyendo(true);
    try {
      const buf = await f.arrayBuffer();
      let filas: Celda[][];
      if (pareceXls(buf)) filas = leerXls(buf, 0);
      else if (pareceXlsx(buf)) filas = await leerXlsx(buf, 0);
      else return setError("Solo se admite el reporte de ventas de Valery en Excel (.xls o .xlsx).");
      const e = errorDeVentas(filas[0] ?? []);
      if (e) return setError(e);
      const lectura = leerVentas(filas);
      const ajenas = facturasAjenas(lectura.renglones, empresa);
      if (ajenas.length) {
        const otra = Object.entries(SERIE_FAC).find(([k]) => k !== empresa)?.[1].nombre ?? "la otra empresa";
        return setError(`Este archivo es de ${otra}: trae sus facturas (${ajenas.slice(0, 3).join(", ")}). Impórtalo en ${otra}, no en ${nombreEmpresa}.`);
      }
      if (!lectura.renglones.length) return setError("El archivo no trae renglones de venta.");
      setVista({ nombre: f.name, hash: await huella(buf), lectura, plan: planVentas(lectura.renglones, corte ?? "9999-12-31") });
    } catch (e) {
      setError(`No se pudo leer el archivo: ${(e as Error).message}`);
    } finally {
      setLeyendo(false);
    }
  }

  async function importar() {
    if (!vista || !corte || guardando) return;
    setGuardando(true); setError(null);
    try {
      // Lo anterior a 60 días antes del corte no sirve ni para reconocer notas viejas.
      const desde = restarDias(corte, 60);
      const r = await importarVentasValery(empresa, vista.nombre, vista.hash, vista.lectura.renglones.filter((x) => x.fecha >= desde));
      if (!r.ok) return setError(r.error);
      setHecho(`Listo: ${n(r.nuevos)} movimiento(s) nuevos del ${dmy(r.desde)} al ${dmy(r.hasta)}.`
        + (r.repetidos ? ` ${n(r.repetidos)} ya estaban importados.` : "")
        + (r.facturasDeNotas ? ` ${n(r.facturasDeNotas)} renglón(es) de factura no descontaron: facturan notas ya descontadas.` : ""));
      setVista(null);
      setRecarga((x) => x + 1);
      onImportada();
    } finally {
      setGuardando(false);
    }
  }

  async function deshacer(i: ImportacionVentas) {
    const r = await deshacerImportacionVentas(i.id);
    if (!r.ok) return setError(r.error);
    setHecho(`Se deshizo la importación «${i.archivo}»: ${n(r.movimientos)} movimiento(s) borrados.`);
    setRecarga((x) => x + 1);
    onImportada();
  }

  const p = vista?.plan;
  const salidas = p?.movimientos.filter((m) => m.direccion === "salida") ?? [];
  const entradas = p?.movimientos.filter((m) => m.direccion === "entrada") ?? [];

  return (
    <SectionCard
      title="Importar Ventas de Valery"
      description={corte === undefined ? "…" : corte
        ? `Sube la «Relación de Ventas Diarias (Detallado por Renglón)» tal como sale de Valery. Entran las ventas desde el ${dmy(corte)}: lo anterior ya está en la existencia.`
        : `${nombreEmpresa} todavía no puede importar ventas: primero hay que alinear su existencia con Valery.`}
    >
      {corte && (
        <div className="space-y-3">
          <input type="file" accept=".xls,.xlsx" aria-label="Subir el reporte de ventas de Valery"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f); e.target.value = ""; }}
            className="block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:text-sm file:font-medium file:text-brand" />
          <p className="text-xs text-muted">Conviene exportar desde unos 30 días antes de lo nuevo: así se reconocen las facturas de notas de entrega viejas y no se descuentan dos veces.</p>
          {leyendo && <p className="text-xs text-muted">Leyendo…</p>}
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {hecho && <p role="status" className="mt-3 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{hecho}</p>}

      {vista && p && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-xs text-muted">
            {vista.nombre} · formato {vista.lectura.formato === "completo" ? "completo" : "agrupado por documento"} · {n(vista.lectura.renglones.length)} renglón(es)
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Salidas", salidas.length, "facturas y notas"],
              ["Entradas", entradas.length, "devoluciones"],
              ["No descuentan", p.facturasDeNotas, "facturas de notas"],
              ["Antes del corte", p.antesDelCorte, "ya en la existencia"],
            ].map(([t, v, s]) => (
              <div key={t as string} className="rounded-lg bg-surface px-3 py-2">
                <p className="text-xs text-muted">{t}</p>
                <p className="text-lg font-semibold tabular-nums text-text">{n(v as number)}</p>
                <p className="text-[11px] text-muted">{s}</p>
              </div>
            ))}
          </div>
          {p.movimientos.length > 0 && <p className="text-sm text-text">Del {dmy(p.desde)} al {dmy(p.hasta)}. Lo que ya se haya importado de otro archivo no se repite.</p>}
          {(vista.lectura.problemas.length > 0 || vista.lectura.enCero > 0) && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 p-2 text-xs text-warn">
              {vista.lectura.enCero > 0 && <p>{n(vista.lectura.enCero)} renglón(es) con cantidad 0: no mueven nada.</p>}
              {vista.lectura.problemas.length > 0 && <p>{n(vista.lectura.problemas.length)} renglón(es) no se pueden leer:</p>}
              <ul className="mt-1 space-y-0.5">
                {vista.lectura.problemas.slice(0, 5).map((x, i) => <li key={i}>fila {x.linea}: {x.motivo}</li>)}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button icon="import" className="flex-1" disabled={guardando || !p.movimientos.length} onClick={importar}>
              {guardando ? "Importando…" : p.movimientos.length ? `Importar ${n(p.movimientos.length)} movimiento(s)` : "Nada desde el corte"}
            </Button>
            <Button variant="secondary" disabled={guardando} onClick={() => setVista(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      {lista.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-muted">Últimas importaciones de ventas</p>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {lista.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate text-text">{i.archivo}</span>
                <span className="text-xs text-muted">{dmy(i.desde)} → {dmy(i.hasta)} · {n(i.filas)} mov. · {new Date(i.creada).toLocaleDateString("es-VE")}</span>
                {i.deshacible && (
                  <ConfirmDialog
                    title="¿Deshacer la importación?"
                    message={`Se borran sus ${n(i.filas)} movimiento(s) y la existencia vuelve a como estaba antes de importarla.`}
                    confirmLabel="Sí, deshacer" cancelLabel="No"
                    onConfirm={() => deshacer(i)}
                    trigger={(abrir) => <Button variant="secondary" onClick={abrir}>Deshacer</Button>}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
