"use client";

// Puente con Valery (docs/decisions/puente-valery.md).
//
// Desde aquí el Owner o un Administrador:
//   · instala el agente en el servidor de Valery (genera un instalador con la
//     clave de esta empresa) y ve si está conectado;
//   · le pide datos: ventas de un rango, CxC, CxP, existencias o una prueba;
//   · ve lo que trajo, lo descarga y, en las ventas, lo aplica al kardex con el
//     mismo importador que los Excel.
// El agente nunca escribe en Valery: lee una copia de su base.

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { ProveedorExportar, useExportable } from "@/lib/ux/exportar";
import { useCarga } from "@/lib/ux/use-carga";
import { fechaVista, type Celda, type Columna } from "@/lib/ux/tabla-export";
import {
  agentePuente, aplicarVentasPuente, cancelarPedidoPuente, crearAgentePuente, pedirAlPuente, resultadoPuente,
  revocarAgentePuente, solicitudesPuente, type AgentePuente, type SolicitudPuente,
} from "@/lib/valery/puente-db";
import { conectado, haceCuanto, NOMBRE_SOLICITUD, type EstadoSolicitud, type TipoSolicitud } from "@/lib/valery/puente";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const haceDias = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date(Date.now() - n * 86400000));
const num = (n: unknown, d = 2) => (typeof n === "number" ? n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" }) : "—");

const ESTADO: Record<EstadoSolicitud, { t: string; tone: Tone }> = {
  pendiente: { t: "Esperando al agente", tone: "muted" },
  en_proceso: { t: "Leyendo Valery…", tone: "info" },
  lista: { t: "Lista", tone: "ok" },
  error: { t: "Error", tone: "danger" },
  aplicada: { t: "Aplicada al kardex", tone: "brand" },
  cancelada: { t: "Cancelada", tone: "muted" },
};

export function PuenteValery({ empresa }: { empresa: string }) {
  // Se refresca solo, sin vaciar la pantalla: lo último leído queda a la vista
  // hasta que llega lo nuevo.
  const [recarga, setRecarga] = useState(0);
  const [estado, setEstado] = useState<{ agente: AgentePuente | null; pedidos: SolicitudPuente[]; error: string | null; cargado: boolean }>(
    { agente: null, pedidos: [], error: null, cargado: false });
  useEffect(() => {
    let vigente = true;
    Promise.all([agentePuente(empresa), solicitudesPuente(empresa)])
      .then(([ag, ps]) => { if (vigente) setEstado({ agente: ag, pedidos: ps, error: null, cargado: true }); })
      .catch((e) => { if (vigente) setEstado((x) => ({ ...x, error: (e as Error).message, cargado: true })); });
    return () => { vigente = false; };
  }, [empresa, recarga]);
  const [desde, setDesde] = useState(haceDias(7));
  const [hasta, setHasta] = useState(hoy());
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [yendo, setYendo] = useState<string | null>(null);
  const [instalar, setInstalar] = useState(false);
  const [viendo, setViendo] = useState<SolicitudPuente | null>(null);
  const [, setReloj] = useState(0);

  // Mientras haya algo en camino se mira cada 4 s; si no, cada 20 s (para el «hace cuánto»).
  const enCamino = estado.pedidos.some((p) => p.estado === "pendiente" || p.estado === "en_proceso");
  useEffect(() => {
    const t = setInterval(() => { setRecarga((n) => n + 1); setReloj((n) => n + 1); }, enCamino ? 4000 : 20000);
    return () => clearInterval(t);
  }, [enCamino]);

  const a = estado.agente;
  const vivo = conectado(a?.ultimoContacto ?? null);
  const info = (a?.info ?? {}) as Record<string, string | number | undefined>;
  const baseVieja = !!info.ultimaVenta && String(info.ultimaVenta) < haceDias(30);

  async function pedir(tipo: TipoSolicitud) {
    setMsg(null); setYendo(tipo);
    const r = await pedirAlPuente(empresa, tipo, tipo === "ventas" ? { desde, hasta } : {});
    setYendo(null);
    if (!r.ok) return setMsg({ ok: false, t: r.error });
    setMsg({ ok: true, t: `Pedido ${r.id} enviado. ${vivo ? "El agente lo toma en segundos." : "El agente no está conectado: lo tomará cuando se conecte."}` });
    setRecarga((n) => n + 1);
  }

  async function aplicar(p: SolicitudPuente) {
    setMsg(null); setYendo(`aplicar-${p.id}`);
    const r = await aplicarVentasPuente(p.id);
    setYendo(null);
    if (!r.ok) return setMsg({ ok: false, t: r.error });
    setMsg({ ok: true, t: `Ventas aplicadas al kardex: ${r.nuevos} renglón(es) nuevos, ${r.repetidos} ya estaban (por Excel o por el puente)${r.facturasDeNotas ? `, ${r.facturasDeNotas} facturas de notas ya descontadas` : ""}.` });
    setRecarga((n) => n + 1);
  }

  return (
    <SectionCard title="Puente con Valery" className="lg:col-span-2"
      description="Trae datos de Valery a Macedonia leyendo una copia de su base. Nunca escribe en Valery."
      action={a ? <StatusBadge tone={vivo ? "ok" : "warn"}>{vivo ? "Conectado" : "Desconectado"}</StatusBadge> : <StatusBadge tone="muted">Sin instalar</StatusBadge>}>
      <div className="space-y-5">
        {/* Estado del agente */}
        {!estado.cargado ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : a ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-muted">Último contacto: </dt><dd className="inline font-medium text-text">{haceCuanto(a.ultimoContacto)}</dd></div>
              <div><dt className="inline text-muted">Servidor: </dt><dd className="inline font-medium text-text">{info.equipo ?? "—"}</dd></div>
              <div><dt className="inline text-muted">Copia: </dt><dd className="inline font-medium text-text">{info.metodoCopia ?? "todavía ninguna"}{info.copiaEn ? ` · ${fechaHora(String(info.copiaEn))}` : ""}</dd></div>
              <div><dt className="inline text-muted">Agente: </dt><dd className="inline font-medium text-text">{a.version ? `v${a.version}` : "—"} · instalado {fechaHora(a.creadoEn)}</dd></div>
              <div className="sm:col-span-2"><dt className="inline text-muted">Base: </dt><dd className="inline break-all font-medium text-text">{info.base ?? "—"}</dd></div>
              {info.ultimaVenta ? (
                <div className="sm:col-span-2"><dt className="inline text-muted">Última venta en la copia: </dt><dd className={`inline font-medium ${baseVieja ? "text-warn" : "text-text"}`}>{fechaVista(String(info.ultimaVenta))}{baseVieja ? " — es vieja: puede que no sea la base en uso. Reinstala el agente para que la busque de nuevo." : ""}</dd></div>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setInstalar(true)}>Reinstalar</Button>
              <ConfirmDialog title="¿Desconectar el agente?" confirmLabel="Sí, desconectar" cancelLabel="No"
                message="Su clave deja de servir en el acto. Para volver a conectarlo hay que generar un instalador nuevo y ejecutarlo en el servidor."
                onConfirm={async () => { const r = await revocarAgentePuente(empresa); if (!r.ok) setMsg({ ok: false, t: r.error ?? "No se pudo." }); setRecarga((n) => n + 1); }}
                trigger={(abrir) => <Button variant="ghost" className="text-danger hover:bg-danger/10" onClick={abrir}>Desconectar</Button>} />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-4">
            <p className="max-w-[60ch] text-sm text-muted">
              Todavía no hay un agente en el servidor de Valery de esta empresa. Genera el instalador y ejecútalo una vez en el servidor.
            </p>
            <Button icon="upload" onClick={() => setInstalar(true)}>Instalar en el servidor</Button>
          </div>
        )}

        {/* Pedir */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text">Traer de Valery</h3>
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Ventas desde</span>
              <input type="date" className="sumi-campo w-auto" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted">hasta</span>
              <input type="date" className="sumi-campo w-auto" value={hasta} min={desde} max={hoy()} onChange={(e) => setHasta(e.target.value)} /></label>
            <Button icon="sales" disabled={!a || !!yendo} cargando={yendo === "ventas"} textoCargando="Pidiendo…" onClick={() => pedir("ventas")}>Traer ventas</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["cxc", "cxp", "existencias", "estado"] as const).map((t) => (
              <Button key={t} variant="secondary" disabled={!a || !!yendo} cargando={yendo === t} textoCargando="Pidiendo…" onClick={() => pedir(t)}>
                {t === "estado" ? "Probar conexión" : `Traer ${NOMBRE_SOLICITUD[t].toLowerCase()}`}
              </Button>
            ))}
          </div>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>{msg.t}</p>}
        </div>

        {/* Pedidos */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-text">Pedidos</h3>
          {estado.error ? (
            <p className="text-sm text-danger">{estado.error}</p>
          ) : !estado.pedidos.length ? (
            <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted">Todavía no se le ha pedido nada al agente.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {estado.pedidos.map((p) => {
                const e = ESTADO[p.estado];
                const rango = p.tipo === "ventas" ? ` · ${fechaVista(String(p.parametros.desde ?? ""))} a ${fechaVista(String(p.parametros.hasta ?? ""))}` : "";
                const filas = typeof p.resumen?.filas === "number" ? p.resumen.filas : null;
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">#{p.id} · {NOMBRE_SOLICITUD[p.tipo]}{rango}</p>
                      <p className="text-xs text-muted">
                        {p.creadoNombre ?? "—"} · {fechaHora(p.creadoEn)}{filas !== null ? ` · ${filas.toLocaleString("es-VE")} fila(s)` : ""}
                        {p.resumen?.metodoCopia ? ` · copia por ${String(p.resumen.metodoCopia)}` : ""}
                      </p>
                      {p.error && <p className="mt-1 max-w-[80ch] text-xs text-danger">{p.error}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={e.tone}>{e.t}</StatusBadge>
                      {(p.estado === "lista" || p.estado === "aplicada") && <Button variant="secondary" onClick={() => setViendo(p)}>Ver</Button>}
                      {p.tipo === "ventas" && p.estado === "lista" && (
                        <ConfirmDialog title="¿Aplicar estas ventas al kardex?" confirmLabel="Sí, aplicar" cancelLabel="No"
                          message="Entran con las mismas reglas que el Excel de Valery: FAC y NET salen, DEV entra, y lo que ya se importó (por Excel o por el puente) no se repite. Solo entra lo que es desde el corte de la empresa."
                          onConfirm={() => aplicar(p)}
                          trigger={(abrir) => <Button icon="check" cargando={yendo === `aplicar-${p.id}`} textoCargando="Aplicando…" disabled={!!yendo} onClick={abrir}>Aplicar al kardex</Button>} />
                      )}
                      {p.estado === "pendiente" && (
                        <Button variant="ghost" onClick={async () => { const r = await cancelarPedidoPuente(p.id); if (!r.ok) setMsg({ ok: false, t: r.error ?? "No se pudo." }); setRecarga((n) => n + 1); }}>Cancelar</Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Los montos vienen como los guarda Valery, en bolívares. CxC, CxP y existencias se ven y se descargan; todavía no se escriben en Macedonia.</p>
        </div>
      </div>

      {instalar && <Instalar empresa={empresa} reinstalar={!!a} onCerrar={() => { setInstalar(false); setRecarga((n) => n + 1); }} />}
      {viendo && (
        <ProveedorExportar>
          <VerResultado empresa={empresa} pedido={viendo} onCerrar={() => setViendo(null)} />
        </ProveedorExportar>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------- instalar

function Instalar({ empresa, reinstalar, onCerrar }: { empresa: string; reinstalar: boolean; onCerrar: () => void }) {
  const [yendo, setYendo] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setError(null); setYendo(true);
    try {
      const [ins, age] = await Promise.all([
        fetch("/puente-valery/instalar.ps1", { cache: "no-store" }).then((r) => (r.ok ? r.text() : Promise.reject(new Error("No se pudo leer el instalador.")))),
        fetch("/puente-valery/puente.ps1", { cache: "no-store" }).then((r) => (r.ok ? r.text() : Promise.reject(new Error("No se pudo leer el agente.")))),
      ]);
      const r = await crearAgentePuente(empresa);
      if (!r.ok) return setError(r.error);
      const crlf = (t: string) => t.replace(/\r?\n/g, "\r\n");
      const comando = "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$f='%~f0'; $c=[IO.File]::ReadAllText($f); "
        + "$i=$c.IndexOf('#'+'==INSTALADOR=='); $j=$c.IndexOf('#'+'==AGENTE=='); $PuenteAgente=$c.Substring($j); Invoke-Expression $c.Substring($i, $j-$i)\"";
      const bat = [
        "@echo off",
        "title Instalar Puente Valery (Macedonia)",
        "net session >nul 2>&1",
        "if errorlevel 1 (",
        "  echo Pidiendo permiso de administrador...",
        "  powershell -NoProfile -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\"",
        "  exit /b",
        ")",
        "echo.",
        "echo  Instalador del Puente Valery. Solo lee una COPIA de la base de Valery.",
        "echo.",
        comando,
        "echo.",
        "pause",
        "exit /b",
        "",
        "#==INSTALADOR==",
        `$PuenteUrl = '${window.location.origin}'`,
        `$PuenteEmpresa = '${empresa}'`,
        `$PuenteToken = '${r.token}'`,
        crlf(ins),
        "#==AGENTE==",
        crlf(age),
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob([bat], { type: "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = url; link.download = `Instalar-Puente-Valery-${empresa}.bat`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setListo(true);
    } catch (e) {
      setError((e as Error).message);
    } finally { setYendo(false); }
  }

  return (
    <Modal titulo={reinstalar ? "Reinstalar el Puente" : "Instalar el Puente en el Servidor"} onCerrar={onCerrar}>
      <div className="space-y-4 text-sm text-text">
        {!listo ? (
          <>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Se descarga un archivo <b>.bat</b> con la clave de esta empresa{reinstalar ? "; la clave del agente actual deja de servir" : ""}.</li>
              <li>Cópialo al <b>servidor donde está la base de Valery</b> (en Sumigases, SERVIDORSUD).</li>
              <li>Clic derecho → <b>Ejecutar como administrador</b>. Baja lo que necesita de los sitios oficiales de Firebird, prueba la conexión y queda funcionando solo.</li>
              <li><b>Bórralo después</b>: lleva la clave del agente.</li>
            </ol>
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">El agente solo lee una copia de la base. No modifica Valery ni abre puertos del servidor.</p>
            {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-danger">{error}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
              <Button icon="upload" cargando={yendo} textoCargando="Preparando…" onClick={() => void generar()}>Descargar instalador</Button>
            </div>
          </>
        ) : (
          <>
            <p className="rounded-xl bg-ok/10 px-3 py-2 text-ok">Instalador descargado. Ejecútalo en el servidor como administrador; cuando termine, aquí se verá «Conectado».</p>
            <div className="flex justify-end"><Button onClick={onCerrar}>Listo</Button></div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- ver lo que trajo

const COLUMNAS: Record<Exclude<TipoSolicitud, "estado">, { titulo: string; campo: string; tipo?: Columna["tipo"] }[]> = {
  ventas: [
    { titulo: "Fecha", campo: "fecha", tipo: "fecha" }, { titulo: "Tipo", campo: "tipo" }, { titulo: "Documento", campo: "documento", tipo: "codigo" },
    { titulo: "Cliente", campo: "cliente" }, { titulo: "Código", campo: "codigo", tipo: "codigo" }, { titulo: "Producto", campo: "producto" },
    { titulo: "Cantidad", campo: "cantidad", tipo: "num" }, { titulo: "Neto Bs", campo: "neto", tipo: "num" }, { titulo: "Tasa", campo: "tasa", tipo: "num" },
  ],
  cxc: [
    { titulo: "Tipo", campo: "tipo" }, { titulo: "Documento", campo: "documento", tipo: "codigo" }, { titulo: "Cliente", campo: "cliente" },
    { titulo: "RIF", campo: "rif", tipo: "codigo" }, { titulo: "Emisión", campo: "emision", tipo: "fecha" }, { titulo: "Vence", campo: "vencimiento", tipo: "fecha" },
    { titulo: "Total Bs", campo: "total", tipo: "num" }, { titulo: "Saldo Bs", campo: "saldo", tipo: "num" },
  ],
  cxp: [
    { titulo: "Tipo", campo: "tipo" }, { titulo: "Documento", campo: "documento", tipo: "codigo" }, { titulo: "Proveedor", campo: "proveedor" },
    { titulo: "RIF", campo: "rif", tipo: "codigo" }, { titulo: "Emisión", campo: "emision", tipo: "fecha" }, { titulo: "Vence", campo: "vencimiento", tipo: "fecha" },
    { titulo: "Total Bs", campo: "total", tipo: "num" }, { titulo: "Saldo Bs", campo: "saldo", tipo: "num" },
  ],
  existencias: [
    { titulo: "Código", campo: "codigo", tipo: "codigo" }, { titulo: "Producto", campo: "nombre" }, { titulo: "Depto.", campo: "departamento" },
    { titulo: "Depósito", campo: "deposito" }, { titulo: "Existencia", campo: "existencia", tipo: "num" }, { titulo: "Comprometida", campo: "comprometida", tipo: "num" },
  ],
};

const VISIBLES = 300;

function VerResultado({ empresa, pedido, onCerrar }: { empresa: string; pedido: SolicitudPuente; onCerrar: () => void }) {
  const r = useCarga(`puente-resultado:${pedido.id}`, () => resultadoPuente(pedido.id));
  const datos = r.datos && r.datos.ok ? r.datos.filas : [];
  const cols = pedido.tipo === "estado" ? null : COLUMNAS[pedido.tipo];

  const suma = (campo: string) => datos.reduce((acc, f) => acc + (typeof f[campo] === "number" ? (f[campo] as number) : 0), 0);
  const resumen = pedido.tipo === "ventas" ? `${new Set(datos.map((f) => `${f.tipo}|${f.documento}`)).size} documentos · neto Bs ${num(suma("neto"))}`
    : pedido.tipo === "cxc" ? `${new Set(datos.map((f) => f.cliente_codigo)).size} clientes · saldo Bs ${num(suma("saldo"))}`
    : pedido.tipo === "cxp" ? `${new Set(datos.map((f) => f.proveedor_codigo)).size} proveedores · saldo Bs ${num(suma("saldo"))}`
    : pedido.tipo === "existencias" ? `${datos.filter((f) => typeof f.existencia === "number" && (f.existencia as number) < 0).length} en negativo` : "";

  useExportable(() => (cols ? {
    seccion: `Valery ${NOMBRE_SOLICITUD[pedido.tipo]}`, modulo: "Puente Valery",
    titulo: `${NOMBRE_SOLICITUD[pedido.tipo]} leídas de Valery`,
    detalle: [`Pedido ${pedido.id}`, `Leído ${fechaHora(pedido.terminadoEn)}`, resumen].filter(Boolean),
    columnas: cols.map((c) => ({ titulo: c.titulo, tipo: c.tipo })),
    filas: datos.map((f) => cols.map((c) => (f[c.campo] ?? null) as Celda)),
    nota: "Datos leídos por el Puente Valery de una copia de la base de Valery. Montos en bolívares, como los guarda Valery.",
  } : null));

  return (
    <Modal titulo={`${NOMBRE_SOLICITUD[pedido.tipo]} · pedido ${pedido.id}`} onCerrar={onCerrar} ancho="max-w-5xl">
      {r.cargando ? (
        <p className="py-8 text-center text-sm text-muted">Cargando…</p>
      ) : r.datos && !r.datos.ok ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{r.datos.error}</p>
      ) : !cols ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {Object.entries(pedido.resumen ?? {}).map(([k, v]) => (
            <div key={k}><dt className="inline text-muted">{k}: </dt><dd className="inline font-medium text-text">{String(v)}</dd></div>
          ))}
        </dl>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text"><b className="tabular-nums">{datos.length.toLocaleString("es-VE")}</b> fila(s){resumen ? ` · ${resumen}` : ""}</p>
            <BotonDescargar empresa={empresa} />
          </div>
          <div className="sumi-scroll max-h-[60vh] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
                <tr>{cols.map((c) => <th key={c.campo} className={`px-3 py-2 font-medium ${c.tipo === "num" ? "text-right" : ""}`}>{c.titulo}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {datos.slice(0, VISIBLES).map((f, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c.campo} className={`px-3 py-1.5 ${c.tipo === "num" ? "text-right tabular-nums" : ""} ${c.tipo === "codigo" ? "font-mono" : ""}`}>
                        {c.tipo === "num" ? num(f[c.campo])
                          : c.tipo === "fecha" ? fechaVista(String(f[c.campo] ?? "")) ?? "—" : String(f[c.campo] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {datos.length > VISIBLES && <p className="text-xs text-muted">Se muestran las primeras {VISIBLES}. La descarga trae las {datos.length.toLocaleString("es-VE")}.</p>}
        </div>
      )}
    </Modal>
  );
}
