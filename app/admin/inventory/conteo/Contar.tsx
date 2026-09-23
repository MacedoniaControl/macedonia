"use client";

// La planilla de conteo.
//
// Es un espejo del papel: los mismos datos arriba (fecha, contó, departamento)
// y los renglones en el mismo orden, para pasar la hoja de corrido con el
// teclado. Decisiones que vienen de la maqueta aprobada:
//   · Vacio = sin contar. 0 = no hay ninguno. No son lo mismo.
//   · La existencia del sistema esta oculta por defecto: quien cuenta no
//     deberia saber cuanto "tendria que haber".
//   · Cada renglon se guarda al salir de la casilla: cerrar la pestaña no
//     pierde lo contado.
//   · El lector de codigos del panel viejo se conserva, para contar con el
//     telefono en el galpon.
//   · El Departamento de arriba es un selector: en un conteo de varios
//     departamentos (el general, o la planilla de 75) muestra uno a la vez con
//     su avance, y desde ahi se amplia un conteo a todos los departamentos.

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { AlertCard } from "@/components/ui/AlertCard";
import { EstadoDatos } from "@/components/ui/EstadoDatos";
import { ScanBar } from "@/components/inventory/ScanBar";
import { useCarga } from "@/lib/ux/use-carga";
import { escanear, mensajeDeEscaneo } from "@/lib/inventory/escanear";
import { beep } from "@/lib/inventory/scan-feedback";
import { leerCantidad, vaEntera, fmtCantidad } from "@/lib/inventory/cantidad";
import { esSkuMacedonia, fmtDif, fmtNum } from "@/lib/inventory/acta";
import {
  abrirConteo, anotar, borrarRenglon, cambiarAlcance, conteoAbierto, departamentosDe, lineasDe, planillaDe,
  type Conteo, type ItemPlanilla,
} from "@/lib/inventory/conteos-db";
import { AgregarArticulo } from "./AgregarArticulo";
import { RevisarCierre } from "./RevisarCierre";

export type Fila = {
  renglon: number | null;
  codigo: string;
  nombre: string;
  unidad: string;
  sistema: number;
  /** Codigo del departamento de Valery; null si no se sabe (agregado del catalogo). */
  departamento: string | null;
  /** Agregado fuera de la planilla. */
  extra: boolean;
  texto: string;
  obs: string;
  /** Lo ultimo que quedo guardado en la base: null = no hay renglon. */
  guardado: { cantidad: number; obs: string } | null;
  estado: "" | "guardando" | "error";
  error?: string;
};

export function Contar({ empresa, onCerrado }: { empresa: string; onCerrado: (id: number) => void }) {
  const [recarga, setRecarga] = useState(0);
  const carga = useCarga(`${empresa}:${recarga}`, () => conteoAbierto(empresa));

  if (carga.cargando) return <EstadoDatos cargando vacio={false}>{null}</EstadoDatos>;
  if (carga.error) return <AlertCard tone="danger" titulo="No se pudo leer el conteo" mensaje={carga.error} />;
  if (!carga.datos) return <NuevoConteo empresa={empresa} onAbierto={() => setRecarga((n) => n + 1)} />;
  const c = carga.datos;
  return <Planilla key={`${c.id}:${c.departamento}:${c.zona}`} empresa={empresa} conteo={c} onCerrado={onCerrado} onCambio={() => setRecarga((n) => n + 1)} />;
}

// ---------------------------------------------------------------- abrir

function NuevoConteo({ empresa, onAbierto }: { empresa: string; onAbierto: () => void }) {
  const deps = useCarga(`dep:${empresa}`, () => departamentosDe(empresa));
  const [elegido, setElegido] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const contables = (deps.datos ?? []).filter((d) => d.seCuenta);

  return (
    <section className="max-w-xl space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-base font-semibold text-text">Nuevo conteo</h2>
        <p className="mt-1 text-sm text-muted">
          Se cuenta por departamento, como en Valery, o todo junto para un consolidado. Lo que no se cuente queda
          <b> sin contar</b>, no en cero, y conserva su existencia.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Qué se va a contar</span>
        <select className="sumi-campo" value={elegido} onChange={(e) => setElegido(e.target.value)}>
          <option value="">Elegí un departamento…</option>
          <option value="__general">Todos los departamentos (consolidado)</option>
          <option value="__planilla75">Planilla impresa de 75 productos</option>
          <optgroup label="Departamentos de Valery">
            {contables.map((d) => <option key={d.codigo} value={d.codigo}>{d.codigo} - {d.nombre}</option>)}
          </optgroup>
        </select>
        <span className="mt-1 block text-[11px] text-muted">
          {elegido === "__general"
            ? "Un solo conteo con una sola acta. Se recorre departamento por departamento, y lo que no se llegue a contar queda sin contar."
            : "DIRECTO y ACTIVOS SUDEMATIN no se cuentan."}
        </span>
      </label>
      {msg && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
      <Button icon="inventory" cargando={yendo} textoCargando="Abriendo…" disabled={!elegido || yendo}
        onClick={async () => {
          setMsg(null); setYendo(true);
          try {
            const r = await abrirConteo(empresa, elegido === "__planilla75" ? { planilla: true } : elegido === "__general" ? { general: true } : { departamento: elegido });
            if (!r.ok) return setMsg(r.error);
            onAbierto();
          } finally { setYendo(false); }
        }}>
        Empezar a contar
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------- la planilla

type Filtro = "todos" | "sin" | "contados" | "cero";

// Grupos del selector de Departamento que no son un departamento de Valery.
const SIN_DEPTO = "__sin";
const AGREGADOS = "__agregados";
const grupoDe = (f: Fila) => f.departamento ?? (f.extra ? AGREGADOS : SIN_DEPTO);
// Departamentos por codigo; "sin departamento" y los agregados, al final.
const ordenGrupo = (k: string) => (k === SIN_DEPTO ? "\uffff1" : k === AGREGADOS ? "\uffff2" : k);
const porGrupo = (a: string, b: string) => (ordenGrupo(a) < ordenGrupo(b) ? -1 : ordenGrupo(a) > ordenGrupo(b) ? 1 : 0);

type Propuesta = { tipo: "ampliar" } | { tipo: "cambiar"; departamento: string; nombre: string };

function Planilla({ empresa, conteo, onCerrado, onCambio }: { empresa: string; conteo: Conteo; onCerrado: (id: number) => void; onCambio: () => void }) {
  const datos = useCarga(`planilla:${conteo.id}:${conteo.departamento}:${conteo.zona}`, async () => {
    const [items, lineas] = await Promise.all([planillaDe(empresa, conteo), lineasDe(conteo.id)]);
    return { items, lineas };
  });
  if (datos.cargando) return <EstadoDatos cargando vacio={false}>{null}</EstadoDatos>;
  if (datos.error || !datos.datos) return <AlertCard tone="danger" titulo="No se pudo leer la planilla" mensaje={datos.error ?? ""} />;
  // Se monta recien con los datos: asi arranca con sus filas, sin un efecto que
  // las copie despues.
  return <PlanillaLista empresa={empresa} conteo={conteo} onCerrado={onCerrado} onCambio={onCambio} inicial={armarFilas(datos.datos.items, datos.datos.lineas)} />;
}

function PlanillaLista({ empresa, conteo, onCerrado, onCambio, inicial }: {
  empresa: string; conteo: Conteo; onCerrado: (id: number) => void; onCambio: () => void; inicial: Fila[];
}) {
  const [filas, setFilas] = useState<Fila[]>(inicial);
  // El departamento que se esta mirando ("" = todos). Se recuerda en este
  // navegador; el general arranca en el primero, no con 2.000 renglones.
  const claveDepto = `sumi:conteo:${conteo.id}:depto`;
  const [depto, setDepto] = useState(() => {
    const grupos = new Set(inicial.map(grupoDe));
    try { const g = localStorage.getItem(claveDepto); if (g !== null && (g === "" || grupos.has(g))) return g; } catch { /* sin almacenamiento */ }
    return conteo.origen === "general" ? [...grupos].sort(porGrupo)[0] ?? "" : "";
  });
  const cambiarDepto = (g: string) => { setDepto(g); try { localStorage.setItem(claveDepto, g); } catch { /* idem */ } };
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const deps = useCarga(`dep:${empresa}`, () => departamentosDe(empresa));
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [verSistema, setVerSistema] = useState(false);
  const [lector, setLector] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [agregar, setAgregar] = useState(false);
  const [revisar, setRevisar] = useState(false);
  // "Contó" se recuerda en este navegador hasta cerrar: es un borrador, la base
  // lo recibe al cerrar el conteo. Este componente solo existe en el navegador
  // (se monta despues de traer los datos), asi que leerlo al arrancar es seguro.
  const claveConto = `sumi:conteo:${conteo.id}:conto`;
  const [conto, setConto] = useState(() => { try { return localStorage.getItem(claveConto) ?? ""; } catch { return ""; } });
  const cambiarConto = (v: string) => { setConto(v); try { localStorage.setItem(claveConto, v); } catch { /* sin almacenamiento */ } };
  const refs = useRef(new Map<string, HTMLInputElement>());

  const cuenta = useMemo(() => {
    const k = { ok: 0, cero: 0, sin: 0, error: 0 };
    for (const f of filas) {
      const l = leerCantidad(f.texto);
      if (l.estado === "ok") k.ok++; else if (l.estado === "cero") k.cero++; else if (l.estado === "error") k.error++; else k.sin++;
    }
    return k;
  }, [filas]);


  // Avance por departamento, para el selector.
  const grupos = useMemo(() => {
    const m = new Map<string, { total: number; contados: number }>();
    for (const f of filas) {
      const g = m.get(grupoDe(f)) ?? { total: 0, contados: 0 };
      const e = leerCantidad(f.texto).estado;
      g.total++; if (e === "ok" || e === "cero") g.contados++;
      m.set(grupoDe(f), g);
    }
    return [...m.entries()].sort(([a], [b]) => porGrupo(a, b));
  }, [filas]);
  const nombreDep = new Map((deps.datos ?? []).map((d) => [d.codigo, d.nombre]));
  const etiqueta = (g: string) => (g === SIN_DEPTO ? "Sin departamento" : g === AGREGADOS ? "Agregados al conteo" : `${g} - ${nombreDep.get(g) ?? ""}`);
  const verDepto = grupos.some(([g]) => g === depto) ? depto : "";
  const enDepto = verDepto ? filas.filter((f) => grupoDe(f) === verDepto) : filas;
  const cuentaVista = useMemo(() => {
    const k = { total: enDepto.length, ok: 0, cero: 0, sin: 0 };
    for (const f of enDepto) {
      const e = leerCantidad(f.texto).estado;
      if (e === "ok") k.ok++; else if (e === "cero") k.cero++; else k.sin++;
    }
    return k;
  }, [enDepto]);
  const nadaAnotado = !filas.some((f) => f.guardado);

  const total = filas.length;
  const t = q.trim().toLowerCase();
  const visibles = enDepto.filter((f) => {
    const l = leerCantidad(f.texto).estado;
    if (filtro === "sin" && l !== "vacio" && l !== "error") return false;
    if (filtro === "contados" && l !== "ok" && l !== "cero") return false;
    if (filtro === "cero" && l !== "cero") return false;
    return !t || String(f.renglon ?? "") === t || f.codigo.toLowerCase().includes(t) || f.nombre.toLowerCase().includes(t);
  });

  // Los renglones no se vuelven a dibujar si no cambian (el general tiene miles):
  // lo que necesitan del resto de la planilla lo leen de aca.
  const filasRef = useRef(filas);
  const visiblesRef = useRef(visibles);
  useEffect(() => { filasRef.current = filas; visiblesRef.current = visibles; });

  const cambiar = (codigo: string, parche: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.codigo === codigo ? { ...f, ...parche } : f)));

  async function guardar(f: Fila) {
    const l = leerCantidad(f.texto);
    if (l.estado === "error") return cambiar(f.codigo, { estado: "error", error: l.msg });
    const obs = f.obs.trim();
    // Borrar la cantidad es volver a "sin contar".
    if (l.estado === "vacio") {
      if (!f.guardado) return cambiar(f.codigo, { estado: "" });
      cambiar(f.codigo, { estado: "guardando" });
      const r = await borrarRenglon(conteo.id, f.codigo);
      return cambiar(f.codigo, r.ok ? { estado: "", guardado: null } : { estado: "error", error: r.error });
    }
    if (f.guardado && f.guardado.cantidad === l.valor && f.guardado.obs === obs) return cambiar(f.codigo, { estado: "" });
    cambiar(f.codigo, { estado: "guardando" });
    const r = await anotar(conteo.id, f.codigo, l.valor, { renglon: f.renglon, observacion: obs, nombre: f.nombre, unidad: f.unidad });
    cambiar(f.codigo, r.ok ? { estado: "", guardado: { cantidad: l.valor, obs } } : { estado: "error", error: r.error });
  }

  function mover(codigo: string, paso: 1 | -1) {
    const vs = visiblesRef.current;
    const i = vs.findIndex((f) => f.codigo === codigo);
    const destino = vs[i + paso];
    if (!destino) return;
    const el = refs.current.get(destino.codigo);
    el?.focus(); el?.select();
  }

  function irA(codigo: string, grupo?: string) {
    const f = filasRef.current.find((x) => x.codigo.toUpperCase() === codigo.toUpperCase());
    const g = grupo ?? (f ? grupoDe(f) : AGREGADOS);
    if (verDepto && verDepto !== g) cambiarDepto(g);
    setFiltro("todos"); setQ("");
    requestAnimationFrame(() => {
      const el = refs.current.get(codigo);
      el?.scrollIntoView({ block: "center" }); el?.focus(); el?.select();
    });
  }

  function agregarFila(p: { codigo: string; nombre: string; unidad: string | null }) {
    const ya = filas.find((f) => f.codigo.toUpperCase() === p.codigo.toUpperCase());
    if (!ya) setFilas((fs) => [...fs, { renglon: null, codigo: p.codigo, nombre: p.nombre, unidad: p.unidad ?? "", sistema: 0, departamento: null, extra: true, texto: "", obs: "", guardado: null, estado: "" }]);
    irA(ya?.codigo ?? p.codigo);
  }

  const pendientes = filas.filter((f) => {
    const l = leerCantidad(f.texto);
    if (l.estado === "vacio") return !!f.guardado;
    if (l.estado === "error") return false;
    return !f.guardado || f.guardado.cantidad !== l.valor || f.guardado.obs !== f.obs.trim();
  });
  const contados = cuenta.ok + cuenta.cero;
  const titulo = conteo.departamento ? `${conteo.departamento} - ${conteo.departamentoNombre}` : conteo.zona ?? "Sin departamento";

  return (
    <div className="space-y-4">
      {/* Los datos del papel */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Datos de la planilla</h2>
          <p className="text-xs text-muted">Abierto el {conteo.abiertoEn} · el número se asigna al cerrar</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Fecha del conteo</span>
            <p className="flex h-11 items-center rounded-xl border border-border bg-surface-2 px-3 text-sm">{conteo.fecha.split("-").reverse().join("-")}</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Contó <span className="text-danger">*</span></span>
            <input className="sumi-campo" value={conto} onChange={(e) => cambiarConto(e.target.value)} placeholder="Quién hizo el conteo" autoComplete="off" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Departamento</span>
            <select className="sumi-campo font-medium" value={verDepto} aria-describedby="depto-ayuda"
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__ampliar") return setPropuesta({ tipo: "ampliar" });
                if (v.startsWith("__cambiar:")) {
                  const d = v.slice("__cambiar:".length);
                  return setPropuesta({ tipo: "cambiar", departamento: d, nombre: `${d} - ${nombreDep.get(d) ?? ""}` });
                }
                cambiarDepto(v);
              }}>
              {grupos.length > 1 && (
                <option value="">
                  {conteo.origen === "general" ? "Todos los departamentos (consolidado)" : titulo} · {contados} de {total}
                </option>
              )}
              {grupos.map(([g, n]) => (
                <option key={g} value={g}>{etiqueta(g)} · {n.contados} de {n.total}{n.contados === n.total ? " ✓" : ""}</option>
              ))}
              {grupos.length === 0 && <option value="">{titulo}</option>}
              {(conteo.origen !== "general" || nadaAnotado) && (
                <optgroup label="Cambiar lo que se cuenta">
                  {conteo.origen !== "general" && <option value="__ampliar">Ampliar a todos los departamentos (consolidado)…</option>}
                  {nadaAnotado && (deps.datos ?? []).filter((d) => d.seCuenta && d.codigo !== conteo.departamento).map((d) => (
                    <option key={d.codigo} value={`__cambiar:${d.codigo}`}>Cambiar a {d.codigo} - {d.nombre}…</option>
                  ))}
                </optgroup>
              )}
            </select>
            <span id="depto-ayuda" className="mt-1 block text-[11px] text-muted">
              {conteo.origen === "general" ? "Consolidado: elegí qué departamento estás contando." : grupos.length > 1 ? "Elegí qué parte de la planilla ver." : "Para contar otro departamento o todo junto, elegilo en esta lista."}
            </span>
          </label>
        </div>
      </section>

      {conteo.origen === "libre" && (
        <AlertCard tone="warn" titulo="Este conteo no tiene departamento"
          mensaje="Se abrió antes de que existieran los departamentos, así que no trae planilla. Agregá los artículos uno por uno con «Agregar artículo»." />
      )}

      {/* Avance */}
      <section className="rounded-2xl border border-border bg-surface p-4" aria-label="Avance del conteo">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="text-xl font-semibold tabular-nums text-text">{contados} <span className="text-sm font-medium text-muted">de {total} contados</span></p>
          <p className="text-xs text-muted tabular-nums">{cuenta.ok} con cantidad · {cuenta.cero} en cero · {cuenta.sin + cuenta.error} sin contar</p>
          {verDepto && (
            <p className="text-xs font-medium text-text tabular-nums">
              {etiqueta(verDepto)}: {cuentaVista.ok + cuentaVista.cero} de {cuentaVista.total}
            </p>
          )}
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full border border-border bg-surface-2" aria-hidden>
          <span className="block h-full bg-ok transition-[width]" style={{ width: `${(cuenta.ok / Math.max(total, 1)) * 100}%` }} />
          <span className="block h-full bg-warn transition-[width]" style={{ width: `${(cuenta.cero / Math.max(total, 1)) * 100}%` }} />
        </div>
      </section>

      {/* Herramientas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar renglones">
          {([["todos", "Todos", cuentaVista.total], ["sin", "Sin contar", cuentaVista.sin], ["contados", "Contados", cuentaVista.ok + cuentaVista.cero], ["cero", "En cero", cuentaVista.cero]] as const).map(([id, label, n]) => (
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}
              className={`min-h-9 rounded-full border px-3 text-xs font-medium ${filtro === id ? "border-navy bg-navy text-white" : "border-border bg-surface text-muted hover:text-text"}`}>
              {label} <b className="tabular-nums">{n}</b>
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <input type="search" className="sumi-campo sumi-campo--auto min-w-[14rem] flex-1 sm:max-w-sm" placeholder="Buscar por N°, código o nombre"
            aria-label="Buscar en la planilla" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={verSistema} onChange={(e) => setVerSistema(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Ver lo que dice el sistema
          </label>
          <Button variant="secondary" icon="scan" onClick={() => setLector((v) => !v)}>{lector ? "Ocultar lector" : "Usar lector"}</Button>
          <Button icon="plus" onClick={() => setAgregar(true)}>Agregar artículo</Button>
        </div>
      </div>

      {lector && (
        <ScanBar hint="Dispará el lector: el producto queda listo para anotar su cantidad."
          onScan={async (cod) => {
            const f = filas.find((x) => x.codigo.toUpperCase() === cod.toUpperCase());
            if (f) { beep(true); setAviso({ ok: true, text: `${f.codigo} · ${f.nombre}` }); return irA(f.codigo); }
            const r = await escanear(cod, empresa);
            if (r.estado !== "encontrado") { beep(false); return setAviso(mensajeDeEscaneo(r)); }
            beep(true);
            setAviso({ ok: true, text: `${r.producto.codigo} · ${r.producto.nombre} (no estaba en la planilla: se agregó)` });
            agregarFila(r.producto);
          }} />
      )}
      {aviso && (
        <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${aviso.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
          <Icon name={aviso.ok ? "check" : "alert"} size={14} /> {aviso.text}
        </p>
      )}

      {/* Los renglones */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Planilla de conteo">
        <div className={`hidden gap-3 border-b border-border bg-surface-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted xl:grid ${verSistema ? "xl:grid-cols-[2.5rem_9rem_minmax(0,1fr)_11rem_12rem_5rem_5.5rem]" : "xl:grid-cols-[2.5rem_9rem_minmax(0,1fr)_11rem_12rem]"}`}>
          <span>N°</span><span>Identificación</span><span>Producto</span><span className="text-right">Cantidad contada</span><span>Observación</span>
          {verSistema && <><span className="text-right">Sistema</span><span className="text-right">Diferencia</span></>}
        </div>
        {visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {t ? `Ningún renglón coincide con «${q}»${verDepto ? ` en ${etiqueta(verDepto)}` : ""}.` : "No hay renglones en este filtro."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visibles.map((f) => (
              <Renglon key={f.codigo} f={f} verSistema={verSistema}
                refInput={(el) => { if (el) refs.current.set(f.codigo, el); else refs.current.delete(f.codigo); }}
                onTexto={(v) => cambiar(f.codigo, { texto: v, estado: "", error: undefined })}
                onObs={(v) => cambiar(f.codigo, { obs: v })}
                onGuardar={() => { const x = filasRef.current.find((y) => y.codigo === f.codigo); if (x) guardar(x); }}
                onMover={(p) => mover(f.codigo, p)} />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2 px-4 py-3 text-xs text-muted">
          <span>¿Contaste algo que no está? Todo artículo entra con su código de Valery o con un SKU de Macedonia.</span>
          <span className="hidden gap-3 xl:flex"><span><kbd className="rounded border border-border px-1">Enter</kbd> o <kbd className="rounded border border-border px-1">↓</kbd> siguiente</span><span>Vacío = sin contar · 0 = no hay ninguno</span></span>
        </div>
      </section>

      {/* Barra fija */}
      <div className="sticky bottom-0 z-30 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${filas.some((f) => f.estado === "guardando") ? "bg-warn" : pendientes.length ? "bg-info" : "bg-ok"}`} />
            {filas.some((f) => f.estado === "guardando") ? "Guardando…"
              : pendientes.length ? `${pendientes.length} renglón(es) sin guardar: se guardan al salir de la casilla`
              : "Todo guardado · podés cerrar y seguir después"}
          </p>
          <Button icon="check" disabled={contados === 0} onClick={async () => {
            // Lo que quedo escrito sin salir de la casilla se guarda antes de revisar.
            for (const f of pendientes) await guardar(f);
            setRevisar(true);
          }}>
            Revisar y cerrar
          </Button>
        </div>
      </div>

      {agregar && (
        <AgregarArticulo
          empresa={empresa} conteoId={conteo.id} departamento={conteo.departamento ?? (verDepto.startsWith("__") ? null : verDepto || null)}
          enPlanilla={(cod) => filas.some((f) => f.codigo.toUpperCase() === cod.toUpperCase())}
          onCerrar={() => setAgregar(false)}
          onValery={(p) => { setAgregar(false); agregarFila(p); }}
          onNuevo={(fila) => {
            setAgregar(false);
            setFilas((fs) => [...fs, fila]);
            setAviso({ ok: true, text: `${fila.codigo} asignado y agregado al conteo.` });
            irA(fila.codigo, grupoDe(fila));
          }}
        />
      )}
      {propuesta && (
        <CambiarAlcance conteoId={conteo.id} empresa={empresa} propuesta={propuesta} anotados={filas.filter((f) => f.guardado).length}
          antes={async () => { for (const f of pendientes) await guardar(f); }}
          onCerrar={() => setPropuesta(null)} onHecho={onCambio} />
      )}
      {revisar && (
        <RevisarCierre
          conteoId={conteo.id} titulo={titulo} fecha={conteo.fecha} conto={conto} onConto={cambiarConto}
          filas={filas} sinContar={cuenta.sin} errores={filas.filter((f) => leerCantidad(f.texto).estado === "error")}
          onCerrar={() => setRevisar(false)}
          onCerrado={() => { try { localStorage.removeItem(claveConto); } catch { /* idem */ } onCerrado(conteo.id); }}
        />
      )}
    </div>
  );
}

function armarFilas(items: ItemPlanilla[], lineas: Awaited<ReturnType<typeof lineasDe>>): Fila[] {
  const L = new Map(lineas.map((l) => [l.codigo, l]));
  const filas: Fila[] = items.map((it) => {
    const l = L.get(it.codigo);
    return {
      renglon: it.renglon, codigo: it.codigo, nombre: it.nombre, unidad: it.unidad, sistema: it.sistema, departamento: it.departamento, extra: false,
      texto: l ? fmtCantidad(l.cantidad) : "", obs: l?.observacion ?? "",
      guardado: l ? { cantidad: l.cantidad, obs: l.observacion ?? "" } : null, estado: "",
    };
  });
  const enPlanilla = new Set(items.map((i) => i.codigo));
  // Lo anotado fuera de la planilla: articulos agregados o nuevos.
  for (const l of lineas) {
    if (enPlanilla.has(l.codigo)) continue;
    filas.push({
      renglon: null, codigo: l.codigo, nombre: l.nombre ?? l.codigo, unidad: l.unidad ?? "", sistema: 0, departamento: null, extra: true,
      texto: fmtCantidad(l.cantidad), obs: l.observacion ?? "", guardado: { cantidad: l.cantidad, obs: l.observacion ?? "" }, estado: "",
    });
  }
  return filas;
}

// ---------------------------------------------------------------- ampliar o cambiar

function CambiarAlcance({ conteoId, empresa, propuesta, anotados, antes, onCerrar, onHecho }: {
  conteoId: number; empresa: string; propuesta: Propuesta; anotados: number;
  antes: () => Promise<void>; onCerrar: () => void; onHecho: () => void;
}) {
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ampliar = propuesta.tipo === "ampliar";
  return (
    <Modal titulo={ampliar ? "Ampliar a todos los departamentos" : `Cambiar a ${propuesta.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm text-text">
        {ampliar ? (
          <>
            <p>El conteo pasa a abarcar <b>todos los departamentos que se cuentan</b>, y al cerrar sale una sola acta consolidada.</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>{anotados ? `Los ${anotados} renglón(es) ya anotados se conservan.` : "Todavía no hay nada anotado."}</li>
              <li>Con este mismo selector recorrés un departamento a la vez, con su avance.</li>
              <li>Lo que no se llegue a contar queda <b>sin contar</b>, no en cero: conserva su existencia.</li>
            </ul>
          </>
        ) : (
          <p>Todavía no hay nada anotado en este conteo, así que no se pierde nada: la planilla pasa a ser la de {propuesta.nombre}.</p>
        )}
        {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button icon="inventory" cargando={yendo} textoCargando="Cambiando…" onClick={async () => {
            setError(null); setYendo(true);
            try {
              await antes();
              const r = await cambiarAlcance(conteoId, empresa, ampliar ? { general: true } : { departamento: propuesta.departamento });
              if (!r.ok) return setError(r.error);
              onHecho();
            } finally { setYendo(false); }
          }}>
            {ampliar ? "Ampliar el conteo" : "Cambiar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- un renglon

// Solo se vuelve a dibujar si cambia su fila: los avisos que recibe leen el
// estado al momento de usarse, no al dibujarse.
const Renglon = memo(RenglonBase, (a, b) => a.f === b.f && a.verSistema === b.verSistema);

function RenglonBase({ f, verSistema, refInput, onTexto, onObs, onGuardar, onMover }: {
  f: Fila; verSistema: boolean;
  refInput: (el: HTMLInputElement | null) => void;
  onTexto: (v: string) => void; onObs: (v: string) => void; onGuardar: () => void; onMover: (p: 1 | -1) => void;
}) {
  const l = leerCantidad(f.texto);
  const nuevo = esSkuMacedonia(f.codigo);
  const dif = l.estado === "ok" || l.estado === "cero" ? Math.round((l.valor - f.sistema) * 1000) / 1000 : null;
  const decimalRaro = l.estado === "ok" && vaEntera(f.unidad) && !Number.isInteger(l.valor);
  const estadoTexto = f.estado === "error" ? f.error
    : f.estado === "guardando" ? "Guardando…"
    : l.estado === "vacio" ? "Sin contar"
    : l.estado === "error" ? l.msg
    : l.estado === "cero" ? "Cero: no hay ninguno"
    : decimalRaro ? `¿${fmtCantidad(l.valor)} ${f.unidad}? Este producto va por unidad.`
    : /[.,]/.test(f.texto) ? `✓ Son ${fmtCantidad(l.valor)} ${f.unidad}` : "✓ Anotado";
  const tono = f.estado === "error" || l.estado === "error" ? "text-danger" : l.estado === "cero" || decimalRaro ? "text-warn" : l.estado === "ok" ? "text-ok" : "text-muted";
  const borde = f.estado === "error" || l.estado === "error" ? "border-danger bg-danger/5" : l.estado === "cero" ? "border-warn" : l.estado === "ok" ? "border-ok/50" : "border-border-strong";

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); onGuardar(); onMover(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); onGuardar(); onMover(-1); }
  };

  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 focus-within:bg-brand/5 ${verSistema ? "xl:grid-cols-[2.5rem_9rem_minmax(0,1fr)_11rem_12rem_5rem_5.5rem]" : "xl:grid-cols-[2.5rem_9rem_minmax(0,1fr)_11rem_12rem]"} xl:items-start`}>
      <span className="pt-0 text-xs tabular-nums text-muted xl:pt-3">{f.renglon ?? "+"}</span>
      <span className="col-start-2 row-start-2 flex items-center gap-2 xl:col-start-auto xl:row-start-auto xl:block xl:pt-2.5">
        <span className="font-mono text-xs text-text">{f.codigo}</span>
        <span className={`inline-block rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide xl:mt-0.5 xl:block xl:w-fit ${nuevo ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted ring-1 ring-inset ring-border"}`}>
          {nuevo ? "SKU Macedonia" : "Valery"}
        </span>
      </span>
      <span className="col-start-2 row-start-1 text-sm font-medium text-text xl:col-start-auto xl:row-start-auto xl:pt-2.5">
        {f.nombre}
        {f.extra && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-info">{nuevo ? "artículo nuevo" : "fuera de planilla"}</span>}
      </span>
      <div className="col-span-2 grid gap-2 sm:grid-cols-2 xl:contents">
      <div>
        <div className={`flex overflow-hidden rounded-xl border bg-surface-2 focus-within:border-brand ${borde}`}>
          <input ref={refInput} inputMode="decimal" autoComplete="off" placeholder="—" value={f.texto}
            aria-label={`Cantidad contada de ${f.nombre}`}
            onChange={(e) => onTexto(e.target.value)} onBlur={onGuardar} onKeyDown={teclas}
            className="h-11 min-w-0 flex-1 bg-transparent px-3 text-right text-base font-semibold tabular-nums text-text outline-none xl:h-10" />
          <span className="flex min-w-[3rem] items-center justify-center border-l border-border bg-surface px-2 text-xs font-medium text-muted">{f.unidad || "—"}</span>
        </div>
        <p className={`mt-1 min-h-4 text-[11px] tabular-nums ${tono}`}>{estadoTexto}</p>
      </div>
      <input className="sumi-campo xl:h-10" placeholder="Observación (opcional)" value={f.obs}
        aria-label={`Observación de ${f.nombre}`} onChange={(e) => onObs(e.target.value)} onBlur={onGuardar}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onGuardar(); onMover(1); } }} />
      </div>
      {verSistema && (
        <>
          <span className="col-span-2 text-xs tabular-nums text-muted xl:col-span-1 xl:pt-3 xl:text-right"><span className="xl:hidden">Sistema: </span>{nuevo ? "nuevo" : fmtNum(f.sistema)}</span>
          <span className={`col-span-2 text-xs font-semibold tabular-nums xl:col-span-1 xl:pt-3 xl:text-right ${dif === null || nuevo ? "text-muted" : dif < 0 ? "text-danger" : dif > 0 ? "text-info" : "text-muted"}`}>
            <span className="font-normal xl:hidden">Diferencia: </span>{nuevo ? "—" : dif === null ? "—" : fmtDif(dif)}
          </span>
        </>
      )}
    </li>
  );
}
