"use client";

// Los botones de Parque.
//
// · + Agregar Cilindros (Owner, Administrador y Almacén): SOLO para ampliar el
//   parque con cilindros nuevos, usados en buen estado o en mal estado (estos
//   entran «fuera de servicio»). Es un formulario: fecha, de dónde vienen,
//   documento, quién los recibe y una línea por gas. Queda el alta AC-… y
//   cada movimiento la lleva (agregarCilindros, migración 35).
// · Agregar un Gas (Owner y Administrador): cilindros nuevos que entran al
//   parque, de un gas que ya existe o de uno nuevo («+ Gas nuevo…»). Abajo, los
//   gases que se quedaron sin cilindros se pueden quitar.
// · Fuera de Servicio (Owner, Administrador y Técnico): marcar cilindros
//   dañados y reinsertarlos cuando se reparan. Solo mueve la denominación
//   «fuera de servicio»: el cilindro nunca sale del parque, así que el total no
//   cambia. El servidor (cambiarEstado) no acepta otro cambio de estado.

import { useState } from "react";
import { useCarga } from "@/lib/ux/use-carga";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  activarGas, agregarCilindros, cambiarEstado, desactivarGas, gases, ingresarCilindros, saldos,
  type CondicionAlta, type EstadoCilindro, type LineaAlta, type OrigenAlta,
} from "@/lib/cilindros/cilindros-db";

const campo =
  "h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base text-text " +
  "outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/** Valor del selector para «+ Gas nuevo…»: ningún gas se llama así. */
const NUEVO = "__nuevo__";

type Msg = { ok: boolean; texto: string } | null;
type EnPlanta = "lleno" | "vacio";
const PLURAL: Record<EnPlanta, string> = { lleno: "llenos", vacio: "vacíos" };

function Aviso({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"}
      className={`rounded-xl px-3 py-2.5 text-sm ${msg.ok ? "border border-ok/30 bg-ok/10 text-ok" : "border border-danger/30 bg-danger/10 text-danger"}`}>
      {msg.texto}
    </p>
  );
}

function Etiqueta({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-text">{children}</label>;
}

export function AccionesParque({
  empresa, gerencia, operador, recarga, onRegistrada, extra,
}: { empresa: string; gerencia: boolean; operador: boolean; recarga: number; onRegistrada: () => void; extra?: React.ReactNode }) {
  const g = useCarga(`gases:${empresa}:${recarga}`, () => gases(empresa));
  const s = useCarga(`estados:${empresa}:${recarga}`, () => saldos(empresa));
  const lista = (g.datos ?? []).map((x) => x.nombre);
  const hay = (gas: string, estado: EstadoCilindro) => (s.datos ?? []).find((x) => x.gas === gas && x.estado === estado)?.cantidad ?? 0;
  const fueraTotal = (s.datos ?? []).filter((x) => x.estado === "fuera_servicio").reduce((a, x) => a + x.cantidad, 0);

  const [abierto, setAbierto] = useState<"cilindros" | "gas" | "fuera" | null>(null);
  const [aviso, setAviso] = useState<Msg>(null);
  const hecho = (texto: string) => { setAbierto(null); setAviso({ ok: true, texto }); onRegistrada(); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {operador && (
          <Button icon="plus" onClick={() => { setAviso(null); setAbierto("cilindros"); }}>Agregar Cilindros</Button>
        )}
        {gerencia && (
          <Button variant="secondary" icon="plus" onClick={() => { setAviso(null); setAbierto("gas"); }}>Agregar un Gas</Button>
        )}
        <Button variant="secondary" icon="alert" onClick={() => { setAviso(null); setAbierto("fuera"); }}>
          Fuera de Servicio{fueraTotal > 0 ? ` · ${fueraTotal}` : ""}
        </Button>
        {extra}
      </div>
      <Aviso msg={aviso ?? (g.error ? { ok: false, texto: g.error } : null)} />

      {abierto === "cilindros" && (
        <Modal titulo="Agregar Cilindros" onCerrar={() => setAbierto(null)}>
          <AgregarCilindros empresa={empresa} lista={lista} onHecho={hecho} />
        </Modal>
      )}
      {abierto === "gas" && (
        <Modal titulo="Agregar un Gas" onCerrar={() => setAbierto(null)}>
          <AgregarGas empresa={empresa} lista={lista} hay={hay} cargado={!!s.datos} onHecho={hecho} onCambio={onRegistrada} />
        </Modal>
      )}
      {abierto === "fuera" && (
        <Modal titulo="Fuera de Servicio" onCerrar={() => setAbierto(null)}>
          <FueraDeServicio empresa={empresa} lista={lista} hay={hay} onHecho={hecho} />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Agregar Cilindros

const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
const ORIGENES: { id: OrigenAlta; label: string }[] = [
  { id: "compra", label: "Compra a un proveedor" },
  { id: "traspaso", label: "Traspaso (otra sede o empresa)" },
  { id: "donacion", label: "Donación o regalo" },
  { id: "otro", label: "Otro" },
];
const CONDICIONES: { id: CondicionAlta; label: string }[] = [
  { id: "nuevo", label: "Nuevos" },
  { id: "buen_estado", label: "Usados en buen estado" },
  { id: "mal_estado", label: "En mal estado" },
];
type Linea = { gas: string; cantidad: number; condicion: CondicionAlta; estado: EnPlanta; dano: string };

function AgregarCilindros({ empresa, lista, onHecho }: { empresa: string; lista: string[]; onHecho: (t: string) => void }) {
  const nueva = (): Linea => ({ gas: lista[0] ?? "", cantidad: 0, condicion: "nuevo", estado: "vacio", dano: "" });
  const [lineas, setLineas] = useState<Linea[]>(() => [nueva()]);
  const [fecha, setFecha] = useState(hoyCaracas());
  const [origen, setOrigen] = useState<OrigenAlta>("compra");
  const [procedencia, setProcedencia] = useState("");
  const [documento, setDocumento] = useState("");
  const [recibe, setRecibe] = useState("");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [guardando, setGuardando] = useState(false);

  const set = (i: number, cambio: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  const total = lineas.reduce((a, l) => a + (l.cantidad > 0 ? l.cantidad : 0), 0);
  const malos = lineas.filter((l) => l.condicion === "mal_estado").reduce((a, l) => a + (l.cantidad > 0 ? l.cantidad : 0), 0);

  function validar(): string | null {
    if (!fecha || fecha > hoyCaracas()) return "La fecha no puede ser posterior a hoy.";
    if (!recibe.trim()) return "Escribe quién recibe los cilindros: es quien responde por ellos.";
    for (const l of lineas) {
      if (!l.gas) return "Elige el gas de cada línea.";
      if (!(l.cantidad > 0)) return `${l.gas}: la cantidad debe ser mayor que cero.`;
      if (l.condicion === "mal_estado" && !l.dano.trim()) return `${l.gas}: indica qué daño tienen los cilindros en mal estado.`;
    }
    return null;
  }
  async function guardar() {
    if (guardando) return;
    setGuardando(true); setMsg(null);
    try {
      const r = await agregarCilindros(empresa, {
        fecha, origen, procedencia, documento, recibidoPor: recibe, nota,
        lineas: lineas.map<LineaAlta>((l) => ({ gas: l.gas, cantidad: l.cantidad, condicion: l.condicion,
          ...(l.condicion === "mal_estado" ? { dano: l.dano } : { estado: l.estado }) })),
      });
      if (!r.ok) return setMsg({ ok: false, texto: r.error });
      onHecho(`${r.numero}: ${r.cilindros} cilindro(s) agregados al parque, recibidos por ${recibe.trim()}.`);
    } finally { setGuardando(false); }
  }

  if (lista.length === 0) {
    return <p className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm text-muted">Esta empresa no tiene gases en la lista. Primero agrega uno con «Agregar un Gas».</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Solo para ampliar el parque: cilindros que se compran, se reciben o se recuperan. Todos suman al total; los que están en mal estado entran «fuera de servicio».</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Etiqueta htmlFor="ac-fecha">Fecha</Etiqueta>
          <input id="ac-fecha" type="date" value={fecha} max={hoyCaracas()} onChange={(e) => setFecha(e.target.value)} className={campo} />
        </div>
        <div>
          <Etiqueta htmlFor="ac-origen">De dónde vienen</Etiqueta>
          <select id="ac-origen" value={origen} onChange={(e) => setOrigen(e.target.value as OrigenAlta)} className={campo}>
            {ORIGENES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <Etiqueta htmlFor="ac-proc">{origen === "compra" ? "Proveedor" : "Procedencia"}</Etiqueta>
          <input id="ac-proc" value={procedencia} onChange={(e) => setProcedencia(e.target.value)} className={campo}
            placeholder={origen === "compra" ? "Ej.: Star Gas" : "Opcional"} />
        </div>
        <div>
          <Etiqueta htmlFor="ac-doc">Documento</Etiqueta>
          <input id="ac-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} className={campo} placeholder="Factura o nota · opcional" />
        </div>
      </div>

      {/* Una línea por gas y condición */}
      <div className="space-y-2">
        {lineas.map((l, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Cilindros {lineas.length > 1 ? i + 1 : ""}</span>
              {lineas.length > 1 && (
                <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                  className="min-h-9 rounded-lg px-2 text-xs text-muted hover:text-danger">Quitar</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Etiqueta htmlFor={`ac-gas-${i}`}>Gas</Etiqueta>
                <select id={`ac-gas-${i}`} value={l.gas} onChange={(e) => set(i, { gas: e.target.value })} className={campo}>
                  {lista.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <Etiqueta htmlFor={`ac-cant-${i}`}>Cantidad</Etiqueta>
                <CampoNumero id={`ac-cant-${i}`} valor={l.cantidad} onChange={(n) => set(i, { cantidad: n })} className={campo} />
              </div>
              <div>
                <Etiqueta htmlFor={`ac-cond-${i}`}>Condición</Etiqueta>
                <select id={`ac-cond-${i}`} value={l.condicion} onChange={(e) => set(i, { condicion: e.target.value as CondicionAlta })} className={campo}>
                  {CONDICIONES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              {l.condicion === "mal_estado" ? (
                <div>
                  <Etiqueta htmlFor={`ac-dano-${i}`}>Qué daño tienen *</Etiqueta>
                  <input id={`ac-dano-${i}`} value={l.dano} onChange={(e) => set(i, { dano: e.target.value })} className={campo}
                    placeholder="Ej.: válvula dañada" />
                </div>
              ) : (
                <div>
                  <Etiqueta htmlFor={`ac-est-${i}`}>Entran</Etiqueta>
                  <select id={`ac-est-${i}`} value={l.estado} onChange={(e) => set(i, { estado: e.target.value as EnPlanta })} className={campo}>
                    <option value="vacio">Vacíos</option>
                    <option value="lleno">Llenos</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
        <Button variant="secondary" icon="plus" onClick={() => setLineas((ls) => [...ls, nueva()])}>Otro gas o condición</Button>
      </div>

      <div>
        <Etiqueta htmlFor="ac-recibe">Quién recibe los cilindros *</Etiqueta>
        <input id="ac-recibe" value={recibe} onChange={(e) => setRecibe(e.target.value)} className={campo}
          placeholder="Nombre y apellido" autoComplete="name" />
      </div>
      <div>
        <Etiqueta htmlFor="ac-nota">Nota</Etiqueta>
        <input id="ac-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={campo} placeholder="Opcional" />
      </div>

      {total > 0 && (
        <p className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-text">
          Entran <b className="tabular-nums">{total}</b> cilindro(s) al parque{malos > 0 ? `, ${malos} fuera de servicio` : ""}.
        </p>
      )}
      <Aviso msg={msg} />
      <ConfirmDialog
        title="¿Agregar los cilindros al parque?"
        message={`${lineas.filter((l) => l.cantidad > 0).map((l) => `${l.cantidad} ${l.gas} ${CONDICIONES.find((c) => c.id === l.condicion)!.label.toLowerCase()}`).join(", ")}. Recibe ${recibe.trim() || "—"}. Suman al total del parque y queda el registro.`}
        confirmLabel="Sí, agregar" cancelLabel="No" onConfirm={guardar}
        trigger={(abrir) => (
          <Button icon="plus" className="w-full" cargando={guardando} textoCargando="Guardando…"
            onClick={() => { const e = validar(); if (e) return setMsg({ ok: false, texto: e }); setMsg(null); abrir(); }}>
            Agregar al parque{total > 0 ? ` · ${total}` : ""}
          </Button>
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Agregar un Gas

function AgregarGas({ empresa, lista, hay, cargado, onHecho, onCambio }: {
  empresa: string; lista: string[]; hay: (g: string, e: EstadoCilindro) => number; cargado: boolean;
  onHecho: (t: string) => void; onCambio: () => void;
}) {
  const [elegido, setGas] = useState("");
  const gas = elegido || lista[0] || NUEVO;
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [cant, setCant] = useState(0);
  const [estado, setEstado] = useState<EnPlanta>("lleno");
  const [msg, setMsg] = useState<Msg>(null);
  const [guardando, setGuardando] = useState(false);
  const esNuevo = gas === NUEVO;

  // Gases activos que ya no tienen ni un cilindro: son los únicos que se pueden quitar.
  const total = (x: string) => (["lleno", "vacio", "en_cliente", "en_llenado", "fuera_servicio"] as EstadoCilindro[]).reduce((a, e) => a + hay(x, e), 0);
  const sinCilindros = cargado ? lista.filter((x) => total(x) === 0) : [];

  async function guardar() {
    setMsg(null);
    if (cant <= 0) return setMsg({ ok: false, texto: "La cantidad debe ser mayor que cero." });
    if (esNuevo && !nombreNuevo.trim()) return setMsg({ ok: false, texto: "Escribe el nombre del gas nuevo." });
    if (guardando) return;
    setGuardando(true);
    try {
      let nombre = gas;
      if (esNuevo) {
        const a = await activarGas(nombreNuevo, empresa);
        if (!a.ok) return setMsg({ ok: false, texto: a.error });
        nombre = a.nombre;
      }
      const r = await ingresarCilindros(nombre, cant, estado, empresa);
      if (!r.ok) {
        if (esNuevo) { setGas(nombre); setNombreNuevo(""); onCambio(); }
        return setMsg({ ok: false, texto: `${r.error ?? "No se pudo agregar."}${esNuevo ? ` El gas ${nombre} quedó en la lista, sin cilindros.` : ""}` });
      }
      onHecho(`${cant} cilindro(s) ${PLURAL[estado]} de ${nombre} agregados al parque.${esNuevo ? " Gas nuevo en la lista." : ""}`);
    } finally { setGuardando(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Cilindros nuevos que entran al parque: suman al total. Puede ser de un gas que ya manejan o de uno nuevo.</p>
      <div>
        <Etiqueta htmlFor="ag-gas">Gas</Etiqueta>
        <select id="ag-gas" value={gas} onChange={(e) => setGas(e.target.value)} className={campo}>
          {lista.map((x) => <option key={x} value={x}>{x}</option>)}
          <option value={NUEVO}>+ Gas nuevo…</option>
        </select>
      </div>
      {esNuevo && (
        <div>
          <Etiqueta htmlFor="ag-nuevo">Nombre del gas nuevo</Etiqueta>
          <input id="ag-nuevo" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="HELIO, ACETILENO 8K…" autoCapitalize="characters" autoComplete="off" className={campo} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Etiqueta htmlFor="ag-cant">Cantidad</Etiqueta>
          <CampoNumero id="ag-cant" valor={cant} onChange={setCant} className={campo} />
        </div>
        <div>
          <Etiqueta htmlFor="ag-estado">Entran</Etiqueta>
          <select id="ag-estado" value={estado} onChange={(e) => setEstado(e.target.value as EnPlanta)} className={campo}>
            <option value="lleno">Llenos</option>
            <option value="vacio">Vacíos</option>
          </select>
        </div>
      </div>
      <Aviso msg={msg} />
      <Button icon="plus" className="w-full" cargando={guardando} textoCargando="Guardando…" onClick={guardar}>Agregar al parque</Button>

      {/* Quitar un gas: solo los que no tienen cilindros. Con cilindros
          desaparecería de las listas y sus cilindros seguirían contando. */}
      {sinCilindros.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs text-muted">Gases sin cilindros. Si ya no los manejan, quítalos de las listas:</p>
          <div className="flex flex-wrap gap-2">
            {sinCilindros.map((x) => (
              <ConfirmDialog key={x}
                title={`¿Quitar ${x}?`}
                message="Deja de aparecer en Entrega, Rampa y Parque. Su historial se conserva. Para volver a usarlo, agrégalo con «+ Gas nuevo…» y el mismo nombre."
                confirmLabel="Sí, quitar" cancelLabel="No"
                onConfirm={async () => {
                  setMsg(null);
                  const r = await desactivarGas(x, empresa);
                  if (!r.ok) return setMsg({ ok: false, texto: r.error ?? "No se pudo quitar." });
                  if (gas === x) setGas("");
                  setMsg({ ok: true, texto: `${x} ya no aparece en las listas.` });
                  onCambio();
                }}
                trigger={(abrir) => (
                  <button type="button" onClick={abrir}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm text-text hover:border-danger/40 hover:text-danger">
                    {x} <span aria-hidden>✕</span><span className="sr-only">Quitar</span>
                  </button>
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Fuera de Servicio

function FueraDeServicio({ empresa, lista, hay, onHecho }: {
  empresa: string; lista: string[]; hay: (g: string, e: EstadoCilindro) => number; onHecho: (t: string) => void;
}) {
  const [modo, setModo] = useState<"marcar" | "reinsertar">("marcar");
  // Para reinsertar solo sirven los gases que tienen algo fuera de servicio.
  const opciones = modo === "marcar" ? lista : lista.filter((x) => hay(x, "fuera_servicio") > 0);
  const [elegido, setGas] = useState("");
  const gas = opciones.includes(elegido) ? elegido : opciones[0] ?? "";
  const [cant, setCant] = useState(0);
  const [estado, setEstado] = useState<EnPlanta>("vacio");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [guardando, setGuardando] = useState(false);

  const disponibles = modo === "marcar" ? hay(gas, estado) : hay(gas, "fuera_servicio");

  async function guardar() {
    setMsg(null);
    if (!gas) return setMsg({ ok: false, texto: "Elige el gas." });
    if (cant <= 0) return setMsg({ ok: false, texto: "La cantidad debe ser mayor que cero." });
    if (cant > disponibles) return setMsg({ ok: false, texto: `Solo hay ${disponibles}.` });
    if (modo === "marcar" && !nota.trim()) return setMsg({ ok: false, texto: "Indica qué daño tiene: sin eso no se puede reclamar ni reparar." });
    if (guardando) return;
    setGuardando(true);
    try {
      const r = modo === "marcar"
        ? await cambiarEstado(gas, cant, estado, "fuera_servicio", empresa, nota)
        : await cambiarEstado(gas, cant, "fuera_servicio", estado, empresa, nota);
      if (!r.ok) return setMsg({ ok: false, texto: r.error ?? "No se pudo registrar." });
      onHecho(modo === "marcar"
        ? `${cant} cilindro(s) de ${gas} quedaron fuera de servicio. Siguen en el parque.`
        : `${cant} cilindro(s) de ${gas} volvieron al parque como ${PLURAL[estado]}.`);
    } finally { setGuardando(false); }
  }

  const pestaña = (id: "marcar" | "reinsertar", t: string) => (
    <button type="button" onClick={() => { setModo(id); setMsg(null); setCant(0); setNota(""); }}
      aria-pressed={modo === id}
      className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-medium transition ${modo === id ? "bg-brand-strong text-white" : "border border-border text-muted hover:text-text"}`}>
      {t}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {pestaña("marcar", "Marcar dañados")}
        {pestaña("reinsertar", "Reinsertar")}
      </div>
      <p className="text-sm text-muted">
        {modo === "marcar"
          ? "Los cilindros dañados siguen siendo del parque: pasan a «fuera de servicio» hasta que se reparen."
          : "Un cilindro reparado vuelve a estar disponible, lleno o vacío."}
      </p>

      {modo === "reinsertar" && opciones.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm text-muted">No hay cilindros fuera de servicio.</p>
      ) : (
        <>
          <div>
            <Etiqueta htmlFor="fs-gas">Gas</Etiqueta>
            <select id="fs-gas" value={gas} onChange={(e) => setGas(e.target.value)} className={campo}>
              {opciones.map((x) => <option key={x} value={x}>{x}{modo === "reinsertar" ? ` · ${hay(x, "fuera_servicio")} fuera de servicio` : ""}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Etiqueta htmlFor="fs-cant">Cantidad</Etiqueta>
              <CampoNumero id="fs-cant" valor={cant} onChange={setCant} className={campo} />
            </div>
            <div>
              <Etiqueta htmlFor="fs-estado">{modo === "marcar" ? "Estaban" : "Vuelven como"}</Etiqueta>
              <select id="fs-estado" value={estado} onChange={(e) => setEstado(e.target.value as EnPlanta)} className={campo}>
                <option value="vacio">Vacíos</option>
                <option value="lleno">Llenos</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted">
            {modo === "marcar"
              ? <>Hay <b className="tabular-nums text-text">{disponibles}</b> {PLURAL[estado]} de {gas}.</>
              : <>Hay <b className="tabular-nums text-text">{disponibles}</b> de {gas} fuera de servicio.</>}
            {cant > disponibles && <span className="text-danger"> No alcanza para {cant}.</span>}
          </p>
          <div>
            <Etiqueta htmlFor="fs-nota">{modo === "marcar" ? "Qué daño tiene *" : "Qué se reparó"}</Etiqueta>
            <input id="fs-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={campo}
              placeholder={modo === "marcar" ? "Ej.: válvula dañada, fuga, prueba hidrostática vencida" : "Opcional"} />
          </div>
          <Aviso msg={msg} />
          <Button icon={modo === "marcar" ? "alert" : "check"} className="w-full" cargando={guardando} textoCargando="Guardando…" onClick={guardar}>
            {modo === "marcar" ? "Marcar fuera de servicio" : "Reinsertar al parque"}
          </Button>
        </>
      )}
    </div>
  );
}
