"use client";

// Captador de escaneos para operadores.
// Los lectores HID (keyboard-wedge) teclean el código y mandan Enter: por eso el
// patrón es un input siempre enfocado. El estado (ACTIVO / PAUSADO / APAGADO) es
// deliberadamente grande y de alto contraste: el operador lo mira de reojo.
// Resuelve con lookupByCodigo() del mismo catálogo que /api/inventory/lookup,
// así la regla de ambigüedad (6X8AT vs 6x8AT) es idéntica en cliente y servidor.

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { lookupByCodigo, type InventoryProduct } from "@/lib/inventory/catalog";
import { beep } from "@/lib/inventory/scan-feedback";

type ScanResult = { id: string; codigo: string; producto: InventoryProduct | null; hora: string };

export function ScanCapture() {
  const [activo, setActivo] = useState(true);
  const [enfocado, setEnfocado] = useState(false);
  const [valor, setValor] = useState("");
  const [ultimo, setUltimo] = useState<ScanResult | null>(null);
  const [historial, setHistorial] = useState<ScanResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const listo = activo && enfocado;

  // Mantener el foco mientras el escaneo esté activo.
  useEffect(() => {
    if (activo) inputRef.current?.focus();
  }, [activo]);

  const procesar = useCallback((raw: string) => {
    const codigo = raw.trim();
    if (!codigo) return;
    const producto = lookupByCodigo(codigo);
    const r: ScanResult = {
      id: `${codigo}-${Date.now()}`,
      codigo,
      producto,
      hora: new Date().toLocaleTimeString("es-VE"),
    };
    setUltimo(r);
    setHistorial((h) => [r, ...h].slice(0, 25));
    beep(!!producto);
    setValor("");
    // Devolver el foco: si no, el escáner queda en PAUSADO y se pierde la
    // siguiente lectura (pasa al pulsar "Buscar" con el ratón).
    inputRef.current?.focus();
  }, []);

  const okCount = historial.filter((h) => h.producto).length;
  const failCount = historial.length - okCount;

  return (
    <>
      {/* ---- Estado del escáner: lo que el operador mira ---- */}
      <button
        type="button"
        onClick={() => {
          setActivo(true);
          inputRef.current?.focus();
        }}
        className={`mb-4 flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left transition ${
          listo
            ? "border-ok bg-ok/10"
            : activo
              ? "border-warn bg-warn/10"
              : "border-border bg-surface-2"
        }`}
      >
        <span className="relative flex h-5 w-5 shrink-0">
          {listo && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />}
          <span className={`relative inline-flex h-5 w-5 rounded-full ${listo ? "bg-ok" : activo ? "bg-warn" : "bg-muted"}`} />
        </span>
        <span className="min-w-0">
          <span className={`block text-xl font-bold tracking-tight ${listo ? "text-ok" : activo ? "text-warn" : "text-muted"}`}>
            {listo ? "ESCANEO ACTIVO" : activo ? "PAUSADO — haz clic aquí para reanudar" : "ESCÁNER APAGADO"}
          </span>
          <span className="block text-sm text-muted">
            {listo
              ? "Listo para leer. Dispara el lector sobre el código."
              : activo
                ? "El campo perdió el foco: los escaneos NO se están registrando."
                : "Actívalo para empezar a leer códigos."}
          </span>
        </span>
      </button>

      <SectionCard
        title="Captador de escaneos"
        description="El lector teclea el código y envía Enter. También puedes escribirlo a mano."
        action={
          <Button variant={activo ? "secondary" : "primary"} icon={activo ? "close" : "check"} onClick={() => setActivo((v) => !v)}>
            {activo ? "Apagar escáner" : "Activar escáner"}
          </Button>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            procesar(valor);
          }}
        >
          <label className="mb-1 block text-xs text-muted">Código escaneado</label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={valor}
              disabled={!activo}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                // Los lectores HID cierran la lectura con Enter. Se procesa aquí
                // explícitamente en vez de confiar en el submit implícito del form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  procesar(e.currentTarget.value);
                }
              }}
              onFocus={() => setEnfocado(true)}
              onBlur={() => setEnfocado(false)}
              placeholder={activo ? "Esperando lectura…" : "Escáner apagado"}
              aria-label="Código escaneado"
              autoComplete="off"
              className={`h-14 w-full rounded-xl border-2 bg-surface-2 px-4 font-mono text-lg text-text transition disabled:opacity-50 ${
                listo ? "border-ok" : "border-border"
              }`}
            />
            <Button type="submit" disabled={!activo || !valor.trim()} icon="search">Buscar</Button>
          </div>
        </form>

        {/* ---- Resultado de la última lectura ---- */}
        {ultimo && (
          <div
            className={`mt-4 rounded-2xl border-2 p-4 ${
              ultimo.producto ? "border-ok bg-ok/5" : "border-danger bg-danger/5"
            }`}
          >
            {ultimo.producto ? (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold text-ok">
                  <Icon name="check" size={16} /> Producto encontrado · {ultimo.hora}
                </p>
                <p className="mt-1 text-lg font-semibold text-text">{ultimo.producto.nombre}</p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span className="text-muted">Código: <span className="font-mono text-text">{ultimo.producto.codigo}</span></span>
                  <span className="text-muted">
                    Existencia:{" "}
                    <span className={`font-semibold ${ultimo.producto.existPpal <= 0 ? "text-danger" : "text-text"}`}>
                      {ultimo.producto.existPpal}
                    </span>{" "}
                    <span className="text-muted">({ultimo.producto.undPpal})</span>
                  </span>
                  {ultimo.producto.existPpal <= 0 && <StatusBadge tone="danger">Sin existencia</StatusBadge>}
                </div>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                  <Icon name="alert" size={16} /> Código no encontrado · {ultimo.hora}
                </p>
                <p className="mt-1 font-mono text-lg text-text">{ultimo.codigo}</p>
                <p className="mt-1 text-sm text-muted">No existe en el catálogo de Valery. Verifica el código o repite la lectura.</p>
              </>
            )}
          </div>
        )}
      </SectionCard>

      {historial.length > 0 && (
        <>
          <div className="h-4" />
          <SectionCard
            title="Lecturas de esta sesión"
            description={`${historial.length} lectura(s) · ${okCount} encontrada(s) · ${failCount} sin resultado.`}
            action={<Button variant="ghost" icon="close" onClick={() => { setHistorial([]); setUltimo(null); }}>Limpiar</Button>}
          >
            <div className="sumi-scroll max-w-full overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2.5 pr-3 font-medium">Hora</th>
                    <th className="py-2.5 pr-3 font-medium">Código</th>
                    <th className="py-2.5 pr-3 font-medium">Producto</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Existencia</th>
                    <th className="py-2.5 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historial.map((h) => (
                    <tr key={h.id} className="hover:bg-surface-2">
                      <td className="py-2.5 pr-3 text-xs text-muted">{h.hora}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-text">{h.codigo}</td>
                      <td className="py-2.5 pr-3 text-text">{h.producto?.nombre ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-right text-text">{h.producto ? h.producto.existPpal : "—"}</td>
                      <td className="py-2.5">
                        {h.producto ? <StatusBadge tone="ok">Encontrado</StatusBadge> : <StatusBadge tone="danger">No encontrado</StatusBadge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </>
  );
}
