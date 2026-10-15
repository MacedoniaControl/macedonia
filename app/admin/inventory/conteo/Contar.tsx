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
//   · El Departamento de arriba solo elige qué parte ver: en un conteo de
//     varios departamentos (todo el inventario, o los 75 más vendidos) muestra
//     uno a la vez con su avance. Qué se cuenta se elige con «Iniciar Conteo»
//     (IniciarConteo.tsx), no aquí: mezclar las dos cosas confundía.

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
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
  anotar, borrarRenglon, conteoAbierto, departamentosDe, guardarConto, lineasDe, planillaDe,
  type Conteo, type ItemPlanilla,
} from "@/lib/inventory/conteos-db";
import { useExportable } from "@/lib/ux/exportar";
import { AgregarArticulo } from "./AgregarArticulo";
import { RevisarCierre } from "./RevisarCierre";
import { CampoConto } from "./CampoConto";
import { CambiarConteo } from "./IniciarConteo";

/** El nombre del conteo, para el encabezado: «Los 75 Más Vendidos», «05 · Soldadura», «Todos los Items». */
function nombreConteo(c: Conteo) {
  if (c.origen === "planilla") return "Los 75 Más Vendidos";
  if (c.origen === "general") return "Todos los Items";
  if (c.departamento) return `${c.departamento} · ${c.departamentoNombre ?? ""}`;
  return "Conteo sin departamento";
}

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

export function Contar({ empresa, gerencia, onCerrado, onCambio, onSinConteo }: {
  empresa: string; gerencia: boolean; onCerrado: (id: number) => void;
  /** Se cambió el conteo: hay que volver a leerlo. */
  onCambio: () => void;
  /** No hay conteo abierto (lo cerró otra persona): volver a la lista. */
  onSinConteo: () => void;
}) {
  // Se vuelve a leer cuando ConteoFisico lo monta de nuevo (al iniciar o cerrar un conteo).
  const carga = useCarga(`abierto:${empresa}`, () => conteoAbierto(empresa));

  if (carga.cargando) return <EstadoDatos cargando vacio={false}>{null}</EstadoDatos>;
  if (carga.error) return <AlertCard tone="danger" titulo="No se pudo leer el conteo" mensaje={carga.error} />;
  if (!carga.datos) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-muted">No hay ningún conteo en curso: puede que alguien lo haya cerrado.</p>
        <Button variant="secondary" onClick={onSinConteo}>Ver los conteos</Button>
      </section>
    );
  }
  const c = carga.datos;
  return <Planilla key={`${c.id}:${c.departamento}:${c.zona}`} empresa={empresa} gerencia={gerencia} conteo={c} onCerrado={onCerrado} onCambio={onCambio} />;
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

type Acciones = { onCambio: () => void };

function Planilla({ empresa, gerencia, conteo, onCerrado, onCambio }: { empresa: string; gerencia: boolean; conteo: Conteo; onCerrado: (id: number) => void } & Acciones) {
  const datos = useCarga(`planilla:${conteo.id}:${conteo.departamento}:${conteo.zona}`, async () => {
    const [items, lineas] = await Promise.all([planillaDe(empresa, conteo), lineasDe(conteo.id)]);
    return { items, lineas };
  });
  if (datos.cargando) return <EstadoDatos cargando vacio={false}>{null}</EstadoDatos>;
  if (datos.error || !datos.datos) return <AlertCard tone="danger" titulo="No se pudo leer la planilla" mensaje={datos.error ?? ""} />;
  // Se monta recien con los datos: asi arranca con sus filas, sin un efecto que
  // las copie despues.
  return <PlanillaLista empresa={empresa} gerencia={gerencia} conteo={conteo} onCerrado={onCerrado} onCambio={onCambio} inicial={armarFilas(datos.datos.items, datos.datos.lineas)} />;
}

function PlanillaLista({ empresa, gerencia, conteo, onCerrado, onCambio, inicial }: {
  empresa: string; gerencia: boolean; conteo: Conteo; onCerrado: (id: number) => void; inicial: Fila[];
} & Acciones) {
  const [verCambio, setVerCambio] = useState(false);
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
  const deps = useCarga(`dep:${empresa}`, () => departamentosDe(empresa));
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  // El conteo es ciego: lo que dice el sistema solo lo destapan el Owner y el
  // Administrador. Quien cuenta no debe saber cuánto «tendría que haber».
  const [verSistemaElegido, setVerSistema] = useState(false);
  const verSistema = gerencia && verSistemaElegido;
  const [lector, setLector] = useState(false);
  // Con el lector abierto, Enter en la cantidad devuelve el foco al lector:
  // escanear → anotar → Enter → escanear, sin tocar la pantalla.
  const lectorRef = useRef(false);
  const scanRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { lectorRef.current = lector; }, [lector]);
  // El último renglón que tuvo el foco: desde ahí busca «Siguiente sin contar».
  const ultimoRef = useRef<string | null>(null);
  // Los toques en − / + se guardan juntos, un momento después del último.
  const pasosRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [agregar, setAgregar] = useState(false);
  const [revisar, setRevisar] = useState(false);
  // «Contó» se elige al iniciar y viaja con el conteo en la base: quien lo siga
  // o lo cierre en otro equipo ve el mismo nombre. Si se corrige aquí, se
  // guarda un momento después de dejar de escribir.
  const [conto, setConto] = useState(conteo.conto ?? "");
  const contoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cambiarConto = (v: string) => {
    setConto(v);
    if (contoTimer.current) clearTimeout(contoTimer.current);
    contoTimer.current = setTimeout(() => {
      void guardarConto(conteo.id, empresa, v).then((r) => { if (!r.ok) setAviso({ ok: false, text: r.error ?? "No se pudo guardar quién cuenta." }); });
    }, 600);
  };
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
  const etiqueta = (g: string) => (g === SIN_DEPTO ? "Sin departamento" : g === AGREGADOS ? "Agregados al conteo" : `${g} - ${nombreDep.get(g) ?? (g === conteo.departamento ? conteo.departamentoNombre ?? "" : "")}`);
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
  // lo que necesitan del resto de la planilla lo leen de aquí.
  const filasRef = useRef(filas);
  const visiblesRef = useRef(visibles);
  useEffect(() => { filasRef.current = filas; visiblesRef.current = visibles; });

  // La planilla como se esta viendo (departamento, filtro, busqueda). Lo que
  // dice el sistema solo va si esta a la vista: el conteo es ciego, y el
  // archivo no puede destaparlo.
  useExportable(() => {
    const FILTRO: Record<Filtro, string> = { todos: "Todos los renglones", sin: "Solo sin contar", contados: "Solo contados", cero: "Solo en cero" };
    return {
      seccion: `Conteo ${titulo}`,
      titulo: `Conteo en Curso · ${titulo}`,
      detalle: [
        ...(verDepto ? [etiqueta(verDepto)] : []),
        FILTRO[filtro],
        ...(t ? [`Búsqueda: «${q.trim()}»`] : []),
        `Fecha ${conteo.fecha.split("-").reverse().join("-")}`,
        ...(conto.trim() ? [`Contó: ${conto.trim()}`] : []),
        `${contados} de ${total} contados`,
      ],
      columnas: [
        { titulo: "N°", tipo: "num" }, { titulo: "Código", tipo: "codigo" }, { titulo: "Producto" }, { titulo: "Unidad" },
        { titulo: "Contado", tipo: "num" }, { titulo: "Estado" }, { titulo: "Observación" },
        ...(verSistema ? [{ titulo: "Sistema", tipo: "num" as const }, { titulo: "Diferencia", tipo: "dif" as const }] : []),
      ],
      filas: visibles.map((f) => {
        const l = leerCantidad(f.texto);
        const valor = l.estado === "ok" || l.estado === "cero" ? l.valor : null;
        const estado = l.estado === "vacio" ? "Sin contar" : l.estado === "cero" ? "Cero" : l.estado === "error" ? "Revisar" : "Contado";
        const nuevo = esSkuMacedonia(f.codigo);
        return [
          f.renglon, f.codigo, f.nombre, f.unidad || null, valor, f.extra ? `${estado} · ${nuevo ? "artículo nuevo" : "fuera de planilla"}` : estado,
          f.obs.trim() || null,
          ...(verSistema ? [nuevo ? null : f.sistema, valor === null || nuevo ? null : Math.round((valor - f.sistema) * 1000) / 1000] : []),
        ];
      }),
      nota: "Planilla de trabajo de un conteo abierto. El acta oficial, con su número, sale al cerrar el conteo. Vacío = sin contar; 0 = no hay ninguno.",
    };
  });

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
    el?.focus({ preventScroll: true }); el?.scrollIntoView({ block: "nearest" }); el?.select();
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

  // − / + : para contar pocas piezas con guantes, sin abrir el teclado.
  // Vacío y + es 1; − nunca baja de 0 ni convierte «sin contar» en algo.
  function paso(codigo: string, p: 1 | -1) {
    const f = filasRef.current.find((x) => x.codigo === codigo);
    if (!f) return;
    const l = leerCantidad(f.texto);
    if (l.estado === "error" || (l.estado === "vacio" && p < 0)) return;
    const base = l.estado === "vacio" ? 0 : l.valor;
    const texto = fmtCantidad(Math.max(0, Math.round((base + p) * 1000) / 1000));
    cambiar(codigo, { texto, estado: "", error: undefined });
    ultimoRef.current = codigo;
    const t = pasosRef.current.get(codigo);
    if (t) clearTimeout(t);
    pasosRef.current.set(codigo, setTimeout(() => {
      pasosRef.current.delete(codigo);
      const x = filasRef.current.find((y) => y.codigo === codigo);
      if (x) void guardar(x);
    }, 700));
  }

  // El próximo renglón sin contar, siguiendo el orden de la hoja desde donde
  // se iba; primero en el departamento que se ve, después en los demás.
  function siguienteSinContar() {
    const sinContar = (f: Fila) => leerCantidad(f.texto).estado === "vacio";
    const todas = filasRef.current;
    const ordenadas = verDepto ? [...todas.filter((f) => grupoDe(f) === verDepto), ...todas.filter((f) => grupoDe(f) !== verDepto)] : todas;
    const desde = ordenadas.findIndex((f) => f.codigo === ultimoRef.current);
    const destino = [...ordenadas.slice(desde + 1), ...ordenadas.slice(0, desde + 1)].find(sinContar);
    if (!destino) return setAviso({ ok: true, text: "No queda nada sin contar. Cuando quieras, «Revisar y cerrar»." });
    setAviso(null);
    irA(destino.codigo);
  }

  // Enter en la cantidad: con el lector abierto vuelve al lector; si no, baja al siguiente.
  function alEnter(codigo: string) {
    if (lectorRef.current && scanRef.current) { scanRef.current.focus({ preventScroll: true }); return; }
    mover(codigo, 1);
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
  const fecha = conteo.fecha.split("-").reverse().join("-");
  // «abierto a las 16:19» si se abrió el mismo día del conteo; si no, con su fecha.
  const [diaAbierto, horaAbierto] = conteo.abiertoEn.split(" ");
  const abierto = diaAbierto === fecha && horaAbierto ? `abierto a las ${horaAbierto}` : `abierto el ${conteo.abiertoEn}`;

  return (
    <div className="space-y-4">
      {/* Qué se está contando: el conteo abierto ES la pantalla. Desde aquí
          se cambia lo que se cuenta; empezar otro no se ofrece, porque solo
          puede haber uno abierto. */}
      {/* Una sola cabecera, como el encabezado del papel: qué se cuenta, cuándo,
          quién contó y cuánto va. Antes eran tres tarjetas, y en el teléfono el
          primer renglón quedaba pantalla y media más abajo. */}
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-label="Conteo en curso">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xl font-semibold text-text">
              {nombreConteo(conteo)}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-semibold text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />En curso
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              Fecha del conteo {fecha} · {abierto} · lo contado se guarda solo: puedes salir y seguir después.
            </p>
          </div>
          <Button variant="secondary" className="sumi-pulsable" onClick={async () => { for (const f of pendientes) await guardar(f); setVerCambio(true); }}>
            Cambiar qué se cuenta
          </Button>
        </div>

        <div className={`grid gap-3 ${grupos.length > 1 ? "sm:grid-cols-2" : "sm:max-w-sm"}`}>
          <CampoConto empresa={empresa} valor={conto} onCambio={cambiarConto} />
          {grupos.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Ver departamento</span>
              <select className="sumi-campo font-medium" value={verDepto} aria-describedby="depto-ayuda" onChange={(e) => cambiarDepto(e.target.value)}>
                <option value="">Todos · {contados} de {total}</option>
                {grupos.map(([g, n]) => (
                  <option key={g} value={g}>{etiqueta(g)} · {n.contados} de {n.total}{n.contados === n.total ? " · listo" : ""}</option>
                ))}
              </select>
              <span id="depto-ayuda" className="mt-1 block text-xs text-muted">Muestra un departamento a la vez, con lo que llevas contado.</span>
            </label>
          )}
        </div>

        {/* Avance */}
        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <p className="text-2xl font-semibold tabular-nums text-text">{contados} <span className="text-sm font-medium text-muted">de {total} contados</span></p>
            <p className="text-xs text-muted tabular-nums">
              {cuenta.ok} con cantidad · {cuenta.cero} en cero · {cuenta.sin} sin contar
              {cuenta.error > 0 && <span className="font-semibold text-danger"> · {cuenta.error} por corregir</span>}
            </p>
            {verDepto && (
              <p className="text-xs font-medium text-text tabular-nums">
                {etiqueta(verDepto)}: {cuentaVista.ok + cuentaVista.cero} de {cuentaVista.total}
              </p>
            )}
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full border border-border bg-surface-2"
            role="progressbar" aria-label="Avance del conteo" aria-valuemin={0} aria-valuemax={total} aria-valuenow={contados}>
            <span className="block h-full bg-ok transition-[width]" style={{ width: `${(cuenta.ok / Math.max(total, 1)) * 100}%` }} />
            <span className="block h-full bg-warn transition-[width]" style={{ width: `${(cuenta.cero / Math.max(total, 1)) * 100}%` }} />
          </div>
        </div>
      </section>

      {conteo.origen === "libre" && (
        <AlertCard tone="warn" titulo="Este conteo no tiene departamento"
          mensaje="Se abrió antes de que existieran los departamentos, así que no trae planilla. Agrega los artículos uno por uno con «Agregar artículo»." />
      )}

      {/* Herramientas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-1 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0" role="group" aria-label="Filtrar renglones">
          {([["todos", "Todos", cuentaVista.total], ["sin", "Sin Contar", cuentaVista.sin], ["contados", "Contados", cuentaVista.ok + cuentaVista.cero], ["cero", "En Cero", cuentaVista.cero]] as const).map(([id, label, n]) => (
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}
              className={`sumi-pulsable min-h-11 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium ${filtro === id ? "border-navy bg-navy text-white" : "border-border bg-surface text-muted hover:text-text"}`}>
              {label} <b className="tabular-nums">{n}</b>
            </button>
          ))}
        </div>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-1 sm:flex-wrap sm:justify-end">
          <input type="search" className="sumi-campo sumi-campo--auto col-span-2 min-w-[14rem] flex-1 sm:max-w-sm" placeholder="Buscar por N°, código o nombre"
            aria-label="Buscar en la planilla" value={q} onChange={(e) => setQ(e.target.value)} />
          {/* Quien cuenta no ve lo que dice el sistema: solo el Owner y el Administrador. */}
          {gerencia && (
            <label className="order-last col-span-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-muted sm:order-none">
              <input type="checkbox" checked={verSistemaElegido} onChange={(e) => setVerSistema(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" />
              Ver lo que dice el sistema
            </label>
          )}
          <Button variant={lector ? "primary" : "secondary"} icon="scan" className="px-3" aria-pressed={lector} onClick={() => setLector((v) => !v)}>{lector ? "Cerrar lector" : "Usar lector"}</Button>
          <Button variant="secondary" icon="plus" className="px-3" onClick={() => setAgregar(true)}>Agregar artículo</Button>
        </div>
      </div>

      {/* El lector queda fijo arriba mientras se cuenta, con su aviso al lado:
          si se va de la pantalla, no se sabe si sigue escuchando. */}
      {(lector || aviso) && (
        <div className={lector ? "sticky top-[4.5rem] z-20 space-y-2 rounded-2xl bg-bg/95 pb-1 backdrop-blur" : ""}>
          {lector && (
            <ScanBar entrada={scanRef} hint="Dispara el lector, anota la cantidad y Enter: vuelve aquí para el siguiente."
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
            <p role="status" className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${aviso.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
              <Icon name={aviso.ok ? "check" : "alert"} size={14} /> {aviso.text}
            </p>
          )}
        </div>
      )}

      {/* Los renglones */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Planilla de conteo">
        <div className={`hidden gap-3 border-b border-border bg-surface-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted xl:grid ${verSistema ? "xl:grid-cols-[2.5rem_9rem_minmax(0,1fr)_11rem_12rem_5rem_5.5rem]" : "xl:grid-cols-[2.5rem_9rem_minmax(0,1fr)_11rem_12rem]"}`}>
          <span>N°</span><span>Identificación</span><span>Producto</span><span className="text-right">Cantidad contada</span><span>Observación</span>
          {verSistema && <><span className="text-right">Sistema</span><span className="text-right">Diferencia</span></>}
        </div>
        {visibles.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">
            {t ? (
              <p>Ningún renglón coincide con «{q.trim()}»{verDepto ? ` en ${etiqueta(verDepto)}` : ""}. Si el artículo existe pero no está en la planilla, agrégalo con «Agregar artículo».</p>
            ) : filtro === "sin" ? (
              <p><b className="text-ok">No queda nada sin contar{verDepto ? ` en ${etiqueta(verDepto)}` : ""}.</b> Cuando quieras, «Revisar y cerrar».</p>
            ) : filtro === "contados" ? (
              <p>Todavía no hay nada contado{verDepto ? ` en ${etiqueta(verDepto)}` : ""}. Anota la primera cantidad en «Todos».</p>
            ) : filtro === "cero" ? (
              <p>Ningún artículo quedó en cero.</p>
            ) : (
              <p>No hay renglones en esta vista.</p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibles.map((f) => (
              <Renglon key={f.codigo} f={f} verSistema={verSistema}
                refInput={(el) => { if (el) refs.current.set(f.codigo, el); else refs.current.delete(f.codigo); }}
                onTexto={(v) => cambiar(f.codigo, { texto: v, estado: "", error: undefined })}
                onObs={(v) => cambiar(f.codigo, { obs: v })}
                onGuardar={() => { const x = filasRef.current.find((y) => y.codigo === f.codigo); if (x) guardar(x); }}
                onMover={(p) => mover(f.codigo, p)}
                onEnter={() => alEnter(f.codigo)}
                onPaso={(p) => paso(f.codigo, p)}
                onFoco={() => { ultimoRef.current = f.codigo; }} />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2 px-4 py-3 text-xs text-muted">
          <span>¿Falta un artículo? Agrégalo con «Agregar artículo».</span>
          <span>Vacío = sin contar · 0 = no hay ninguno</span>
          <span className="hidden xl:inline"><kbd className="rounded border border-border px-1">Enter</kbd> o <kbd className="rounded border border-border px-1">↓</kbd> siguiente renglón</span>
        </div>
      </section>

      {/* Barra fija: cómo va lo guardado, ir a lo que falta y cerrar. */}
      <div className="sumi-barra-fija z-30 rounded-2xl border border-border bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur sm:px-4 sm:py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-xs leading-snug text-muted" aria-live="polite">
            <span className={`h-2 w-2 shrink-0 rounded-full ${filas.some((f) => f.estado === "guardando") ? "bg-warn" : pendientes.length ? "bg-info" : "bg-ok"}`} />
            {filas.some((f) => f.estado === "guardando") ? "Guardando…"
              : pendientes.length ? `${pendientes.length} renglón(es) sin guardar: se guardan al salir de la casilla`
              : contados === 0 ? "Anota al menos una cantidad para poder cerrar."
              : "Todo guardado · puedes salir y seguir después"}
          </p>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
            <Button variant="secondary" icon="arrow-down" disabled={cuenta.sin === 0} onClick={siguienteSinContar}>
              <span className="sm:hidden">Siguiente</span><span className="hidden sm:inline">Siguiente sin contar</span>
            </Button>
            <Button icon="check" disabled={contados === 0} onClick={async () => {
              // Lo que quedo escrito sin salir de la casilla se guarda antes de revisar.
              for (const f of pendientes) await guardar(f);
              setRevisar(true);
            }}>
              Revisar y cerrar
            </Button>
          </div>
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
      {verCambio && (
        <CambiarConteo empresa={empresa} conteo={{ ...conteo, renglones: filas.filter((f) => f.guardado).length }}
          onCerrar={() => setVerCambio(false)} onListo={() => { setVerCambio(false); onCambio(); }} />
      )}
      {revisar && (
        <RevisarCierre
          conteoId={conteo.id} empresa={empresa} titulo={titulo} gerencia={gerencia} fecha={conteo.fecha} conto={conto} onConto={cambiarConto}
          filas={filas} sinContar={cuenta.sin} errores={filas.filter((f) => leerCantidad(f.texto).estado === "error")}
          onCerrar={() => setRevisar(false)}
          onCerrado={() => onCerrado(conteo.id)}
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

// ---------------------------------------------------------------- un renglon

// Solo se vuelve a dibujar si cambia su fila: los avisos que recibe leen el
// estado al momento de usarse, no al dibujarse.
const Renglon = memo(RenglonBase, (a, b) => a.f === b.f && a.verSistema === b.verSistema);

function RenglonBase({ f, verSistema, refInput, onTexto, onObs, onGuardar, onMover, onEnter, onPaso, onFoco }: {
  f: Fila; verSistema: boolean;
  refInput: (el: HTMLInputElement | null) => void;
  onTexto: (v: string) => void; onObs: (v: string) => void; onGuardar: () => void; onMover: (p: 1 | -1) => void;
  /** Enter en la cantidad: al lector si está abierto; si no, al siguiente renglón. */
  onEnter: () => void;
  onPaso: (p: 1 | -1) => void;
  onFoco: () => void;
}) {
  // En el telefono la observacion se abre a pedido: casi nunca se usa, y
  // siempre abierta hace cada renglon el doble de alto.
  const [conObs, setConObs] = useState(false);
  const obsRef = useRef<HTMLInputElement | null>(null);
  const verObs = conObs || !!f.obs;
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
    if (e.key === "Enter") { e.preventDefault(); onGuardar(); onEnter(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onGuardar(); onMover(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); onGuardar(); onMover(-1); }
  };

  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 py-3 sm:gap-y-2 focus-within:bg-brand/5 ${verSistema ? "xl:grid-cols-[2.5rem_9rem_minmax(0,1fr)_11rem_12rem_5rem_5.5rem]" : "xl:grid-cols-[2.5rem_9rem_minmax(0,1fr)_11rem_12rem]"} xl:items-start`}>
      <span className="pt-0 text-xs tabular-nums text-muted xl:pt-3">{f.renglon ?? "+"}</span>
      <span className="col-start-2 row-start-2 flex items-center gap-2 xl:col-start-auto xl:row-start-auto xl:block xl:pt-2.5">
        <span className="font-mono text-xs text-text">{f.codigo}</span>
        {/* Casi todo viene de Valery: solo se marca lo que no. */}
        {nuevo && (
          <span className="inline-block rounded bg-brand/10 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand xl:mt-0.5 xl:block xl:w-fit">SKU Macedonia</span>
        )}
      </span>
      <span className="col-start-2 row-start-1 text-sm font-medium text-text xl:col-start-auto xl:row-start-auto xl:pt-2.5">
        {f.nombre}
        {f.extra && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-info">{nuevo ? "artículo nuevo" : "fuera de planilla"}</span>}
      </span>
      <div className="col-span-2 grid gap-2 sm:grid-cols-2 xl:contents">
      <div>
        <div className={`flex overflow-hidden rounded-xl border bg-surface-2 focus-within:border-brand ${borde}`}>
          {/* − y + para contar pocas piezas con guantes; en la computadora sobran. */}
          <button type="button" tabIndex={-1} aria-label={`Uno menos de ${f.nombre}`} disabled={l.estado === "vacio" || l.estado === "error"}
            onClick={() => onPaso(-1)}
            className="sumi-pulsable flex h-11 w-11 shrink-0 items-center justify-center border-r border-border bg-surface text-text disabled:text-muted disabled:opacity-50 xl:hidden">
            <Icon name="minus" size={18} />
          </button>
          <input ref={refInput} inputMode="decimal" enterKeyHint="next" autoComplete="off" placeholder="—" value={f.texto}
            aria-label={`Cantidad contada de ${f.nombre}`}
            onChange={(e) => onTexto(e.target.value)} onBlur={onGuardar} onKeyDown={teclas} onFocus={onFoco}
            className="sumi-renglon-campo h-11 min-w-0 flex-1 bg-transparent px-3 text-right text-base font-semibold tabular-nums text-text outline-none xl:h-10" />
          <span className="flex min-w-[3rem] items-center justify-center border-l border-border bg-surface px-2 text-xs font-medium text-muted">{f.unidad || "—"}</span>
          <button type="button" tabIndex={-1} aria-label={`Uno más de ${f.nombre}`} disabled={l.estado === "error"}
            onClick={() => onPaso(1)}
            className="sumi-pulsable flex h-11 w-11 shrink-0 items-center justify-center border-l border-border bg-surface text-text disabled:text-muted disabled:opacity-50 xl:hidden">
            <Icon name="plus" size={18} />
          </button>
        </div>
        <div className="mt-1 flex min-h-4 items-start justify-between gap-2">
          <p className={`text-xs tabular-nums ${tono}`}>{estadoTexto}</p>
          {!verObs && (
            <button type="button" className="-my-3 min-h-11 shrink-0 px-2 text-xs font-medium text-brand sm:hidden"
              onClick={() => { setConObs(true); setTimeout(() => obsRef.current?.focus(), 0); }}>
              + Observación
            </button>
          )}
        </div>
      </div>
      <input ref={obsRef} className={`sumi-campo sumi-renglon-campo xl:h-10 ${verObs ? "" : "hidden sm:block"}`} placeholder="Observación (opcional)" value={f.obs}
        aria-label={`Observación de ${f.nombre}`} onChange={(e) => onObs(e.target.value)} onBlur={() => { onGuardar(); if (!f.obs.trim()) setConObs(false); }}
        enterKeyHint="next" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onGuardar(); onMover(1); } }} />
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
