"use client";

// Poner una contraseña nueva a otra persona.
//
// `restablecerPassword()` existia desde hacia tiempo y nadie la llamaba: no
// habia boton en ninguna pantalla. Greeg no podia arrancar el piloto porque no
// tenia como darle su clave a las doce personas.
//
// La clave se ENTREGA EN MANO, no se manda por chat ni por correo: quien la
// escribe aca es el Owner, y el sistema no la guarda en ningun lado desde donde
// se pueda volver a leer.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { restablecerPassword, type UsuarioFila } from "./actions";

const campo =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/** Minimo que exige la accion de servidor. Se repite aca para avisar antes. */
const MINIMO = 8;

export function RestablecerClave({ usuario }: { usuario: UsuarioFila }) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");
  const [verla, setVerla] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cerrar() {
    setAbierto(false);
    setClave("");        // no dejarla en memoria del formulario
    setVerla(false);
    setMsg(null);
  }

  async function guardar() {
    setMsg(null);
    if (clave.length < MINIMO) {
      return setMsg({ ok: false, texto: `La contraseña debe tener al menos ${MINIMO} caracteres.` });
    }
    setGuardando(true);
    try {
      const r = await restablecerPassword(usuario.id, clave);
      if (r.error) return setMsg({ ok: false, texto: r.error });
      setClave("");
      setMsg({ ok: true, texto: r.ok ?? "Contraseña restablecida." });
    } finally {
      setGuardando(false);
    }
  }

  if (!abierto) {
    return (
      <Button variant="secondary" onClick={() => setAbierto(true)}>
        Cambiar clave
      </Button>
    );
  }

  return (
    <div className="ml-auto flex w-full max-w-xs flex-col gap-2 text-left">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">
          Nueva contraseña para {usuario.nombre}
        </span>
        <span className="relative block">
          <input
            type={verla ? "text" : "password"}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="new-password"
            placeholder={`Mínimo ${MINIMO} caracteres`}
            className={`${campo} pr-11`}
          />
          {/* Verla es lo que evita entregar una clave con una errata: quien la
              escribe se la va a dictar a otra persona. */}
          <button
            type="button"
            onClick={() => setVerla((v) => !v)}
            aria-label={verla ? "Ocultar la contraseña" : "Ver la contraseña"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-text"
          >
            <Icon name={verla ? "eye-off" : "eye"} size={16} />
          </button>
        </span>
      </label>

      {msg && (
        <p
          role="alert"
          className={`rounded-xl border px-3 py-2 text-xs ${
            msg.ok
              ? "border-ok/30 bg-ok/10 text-ok"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {msg.texto}
        </p>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        <Button variant="secondary" onClick={cerrar}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
