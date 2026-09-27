"use client";

// Los dos botones de Parque.
//
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
  activarGas, cambiarEstado, desactivarGas, gases, ingresarCilindros, saldos,
  type EstadoCilindro,
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
  empresa, gerencia, recarga, onRegistrada,
}: { empresa: string; gerencia: boolean; recarga: number; onRegistrada: () => void }) {
  const g = useCarga(`gases:${empresa}:${recarga}`, () => gases(empresa));
  const s = useCarga(`estados:${empresa}:${recarga}`, () => saldos(empresa));
  const lista = (g.datos ?? []).map((x) => x.nombre);
  const hay = (gas: string, estado: EstadoCilindro) => (s.datos ?? []).find((x) => x.gas === gas && x.estado === estado)?.cantidad ?? 0;
  const fueraTotal = (s.datos ?? []).filter((x) => x.estado === "fuera_servicio").reduce((a, x) => a + x.cantidad, 0);

  const [abierto, setAbierto] = useState<"gas" | "fuera" | null>(null);
  const [aviso, setAviso] = useState<Msg>(null);
  const hecho = (texto: string) => { setAbierto(null); setAviso({ ok: true, texto }); onRegistrada(); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {gerencia && (
          <Button icon="plus" onClick={() => { setAviso(null); setAbierto("gas"); }}>Agregar un Gas</Button>
        )}
        <Button variant="secondary" icon="alert" onClick={() => { setAviso(null); setAbierto("fuera"); }}>
          Fuera de Servicio{fueraTotal > 0 ? ` · ${fueraTotal}` : ""}
        </Button>
      </div>
      <Aviso msg={aviso ?? (g.error ? { ok: false, texto: g.error } : null)} />

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
