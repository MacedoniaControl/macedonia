"use client";

// Dónde está cada cilindro y quién tiene los que faltan.
//
// Los números NO se guardan: los calcula la base sumando movimientos. Por eso
// siempre cuadran con su propio historial.

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { saldos, comodatos, type SaldoCilindro, type Comodato } from "@/lib/cilindros/cilindros-db";

const ESTADOS: { id: string; label: string; tone: Tone }[] = [
  { id: "lleno", label: "Llenos", tone: "ok" },
  { id: "vacio", label: "Vacíos", tone: "muted" },
  { id: "en_cliente", label: "En cliente", tone: "info" },
  { id: "en_llenado", label: "En llenado", tone: "warn" },
  { id: "fuera_servicio", label: "Fuera de servicio", tone: "danger" },
];

export function SaldosCilindros({ empresa, recarga }: { empresa: string; recarga: number }) {
  const [s, setS] = useState<SaldoCilindro[]>([]);
  const [c, setC] = useState<Comodato[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vigente = true;
    setListo(false);
    Promise.all([saldos(empresa), comodatos(empresa)])
      .then(([sa, co]) => { if (vigente) { setS(sa); setC(co); setError(null); } })
      .catch((e) => { if (vigente) setError((e as Error).message); })
      .finally(() => { if (vigente) setListo(true); });
    return () => { vigente = false; };
  }, [empresa, recarga]);

  const gases = [...new Set(s.map((x) => x.gas))].sort();
  const cant = (gas: string, estado: string) =>
    s.find((x) => x.gas === gas && x.estado === estado)?.cantidad ?? 0;

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Dónde están los cilindros"
        description="Calculado de los movimientos, no de un conteo guardado."
      >
        {error && <p className="text-sm text-danger">{error}</p>}
        {!error && listo && gases.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Todavía no hay cilindros registrados. Da de alta el parque para empezar.
          </p>
        )}
        {gases.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Gas</th>
                  {ESTADOS.map((e) => (
                    <th key={e.id} className="py-2 pr-3 text-right font-medium">{e.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gases.map((g) => (
                  <tr key={g} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-medium text-text">{g}</td>
                    {ESTADOS.map((e) => {
                      const n = cant(g, e.id);
                      return (
                        <td key={e.id} className="py-2.5 pr-3 text-right tabular-nums">
                          {n === 0 ? <span className="text-muted">—</span> : n}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Cilindros en poder de clientes"
        description="Son de la empresa: hay que recuperarlos."
      >
        {listo && c.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Ningún cliente tiene cilindros pendientes.
          </p>
        )}
        {c.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">Gas</th>
                  <th className="py-2 pr-3 text-right font-medium">Tiene</th>
                  <th className="py-2 pr-3 text-right font-medium">Desde hace</th>
                </tr>
              </thead>
              <tbody>
                {c.map((x) => (
                  <tr key={`${x.cliente}-${x.gas}`} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 text-text">{x.cliente}</td>
                    <td className="py-2.5 pr-3 text-muted">{x.gas}</td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-text">
                      {x.enPoder}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {x.dias === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        // Más de 60 días con cilindros ajenos merece una mirada.
                        <StatusBadge tone={x.dias > 60 ? "warn" : "muted"}>
                          {x.dias} día{x.dias === 1 ? "" : "s"}
                        </StatusBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
