"use client";

// Las tasas del encabezado: BCV y USDT en un solo grupo (pedido del usuario,
// 11-11-2026: eran cuatro piezas sueltas con estilos distintos). Cada mitad es
// un botón de 44px que consulta ya; arriba la etiqueta y qué tan fresca está,
// abajo la cifra. En el teléfono, sin la frescura ni «Bs»: solo lo que cabe.
//
// La frescura se calcula con un reloj que avanza cada minuto, no al dibujar.

import { useEffect, useState } from "react";
import { fetchBcvRate, useBcvRate } from "@/lib/ux/bcv-rate";
import { fetchUsdtRate, useUsdtRate } from "@/lib/ux/usdt-rate";
import { fmtTasa } from "@/lib/ux/format";

/** Con más de hora y media sin confirmarse, se avisa: la base las pide cada 30 minutos. */
const VIEJA = 90 * 60_000;
const bs2 = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });
const ddmm = (ymd: string) => ymd.split("-").reverse().slice(0, 2).join("-");

function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

export function TasasCambio() {
  const ahora = useAhora();
  const bcv = useBcvRate();
  const usdt = useUsdtRate();
  const [cargando, setCargando] = useState<"bcv" | "usdt" | null>(null);

  async function consultar(cual: "bcv" | "usdt") {
    setCargando(cual);
    const r = cual === "bcv" ? await fetchBcvRate() : await fetchUsdtRate();
    setCargando(null);
    if (!r.ok) alert(`${cual === "bcv" ? "No se pudo obtener el dólar del BCV." : "No se pudo obtener la tasa USDT."}\n${r.error ?? ""}`);
  }

  const viejaBcv = !!bcv && ahora - new Date(bcv.fetchedAt).getTime() > VIEJA;
  const viejaUsdt = !!usdt && ahora - new Date(usdt.leidaEn).getTime() > VIEJA;

  return (
    <div role="group" aria-label="Tasas de cambio"
      className="flex h-11 shrink-0 items-stretch overflow-hidden rounded-xl border border-border-strong bg-surface">
      <Tasa
        etiqueta="BCV"
        frescura={bcv ? (viejaBcv ? "sin actualizar" : `vale ${ddmm(bcv.fecha)}`) : null}
        vieja={viejaBcv}
        cifra={bcv ? fmtTasa(bcv.tasa) : null}
        cargando={cargando === "bcv"}
        onClick={() => consultar("bcv")}
        accion="Consultar ahora el dólar BCV"
        detalle={bcv
          ? `Dólar BCV: ${fmtTasa(bcv.tasa)} Bs, vale el ${ddmm(bcv.fecha)}. Confirmada a las ${hora(bcv.fetchedAt)}.`
            + (bcv.proxima ? ` Ya publicada la del ${ddmm(bcv.proxima.fechaValor)}: ${fmtTasa(bcv.proxima.tasa)} Bs.` : "")
            + " Se actualiza sola cada 30 minutos; toca para consultar ya."
          : "Dólar BCV: todavía sin lectura. Toca para consultar."}
      />
      <span aria-hidden className="my-2 w-px shrink-0 bg-border" />
      <Tasa
        etiqueta="USDT"
        frescura={usdt ? (viejaUsdt ? "sin actualizar" : hora(usdt.leidaEn)) : null}
        vieja={viejaUsdt}
        cifra={usdt ? bs2(usdt.tasa) : null}
        cargando={cargando === "usdt"}
        onClick={() => consultar("usdt")}
        accion="Consultar ahora la tasa USDT"
        detalle={usdt
          ? `USDT (usdt.com.ve, referencia P2P de Binance y Bybit): ${bs2(usdt.tasa)} Bs`
            + (usdt.compra ? ` · compra ${bs2(usdt.compra)}` : "") + (usdt.venta ? ` · venta ${bs2(usdt.venta)}` : "")
            + `. Leída a las ${hora(usdt.leidaEn)}. Se actualiza sola cada 30 minutos; toca para consultar ya.`
          : "USDT: todavía sin lectura. Toca para consultar."}
      />
    </div>
  );
}

function Tasa({ etiqueta, frescura, vieja, cifra, cargando, onClick, accion, detalle }: {
  etiqueta: string; frescura: string | null; vieja: boolean; cifra: string | null;
  cargando: boolean; onClick: () => void; accion: string; detalle: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={cargando} aria-label={`${accion}. ${detalle}`} title={detalle}
      aria-busy={cargando}
      className="flex min-w-0 flex-col items-start justify-center gap-0.5 px-2 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:cursor-progress sm:px-3">
      <span className="flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold uppercase leading-none tracking-wide text-muted">
        {etiqueta}
        {frescura && (
          <span className={`hidden font-medium normal-case tracking-normal sm:inline ${vieja ? "text-warn" : ""}`}>· {frescura}</span>
        )}
        {/* En el teléfono no cabe la frescura: si está vieja, un punto lo dice (y el detalle, en palabras). */}
        {vieja && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn sm:hidden" />}
      </span>
      <span className={`whitespace-nowrap text-sm font-semibold leading-none tabular-nums text-text transition-opacity ${cargando ? "animate-pulse opacity-50" : ""}`}>
        {cifra ?? <span className="text-muted">—</span>}
        {cifra && <span className="ml-0.5 hidden text-xs font-medium text-muted sm:inline">Bs</span>}
      </span>
    </button>
  );
}
