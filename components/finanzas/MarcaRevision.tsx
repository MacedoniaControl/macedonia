import type { Revision } from "@/lib/finanzas/retencion";
import { fmtUsd } from "@/lib/ux/format";

/**
 * Marca las cuentas cuyo desglose no es el 16% plano.
 *
 * Greeg pidio que se le avise cuando una factura no este integramente gravada.
 * No es un error de carga: hay proveedores de alimentos -FEBECA, LA FUENTE-
 * cuyas facturas llevan renglones exentos. Lo que importa es que si esa cuenta
 * se recalcula con el IVA automatico, el IVA sube y con el la retencion, que
 * es plata que se entera al SENIAT.
 *
 * Por eso el texto dice QUE tiene de raro, no solo que lo tiene: quien la abra
 * para editarla tiene que saber que no debe dejar que se recalcule sola.
 */
export function MarcaRevision({ revision }: { revision: Revision }) {
  if (!revision.atipico) return null;

  const texto =
    revision.motivo === "exento"
      ? `${fmtUsd(revision.exento)} de esta factura no llevan IVA. Si la editas, carga la base y el IVA a mano: el 16% automático los gravaría de más.`
      : `El IVA es el ${(revision.tasa * 100).toFixed(2)}% de la base, no el 16%. La factura tiene renglones exentos sumados dentro de la base. Si la editas, carga la base y el IVA a mano.`;

  return (
    <span
      title={texto}
      className="ml-1.5 inline-flex items-center rounded px-1.5 py-px align-middle text-[10px] font-medium uppercase tracking-wide text-warn ring-1 ring-inset ring-warn/40"
    >
      {revision.motivo === "exento" ? "exento" : "IVA"}
    </span>
  );
}
