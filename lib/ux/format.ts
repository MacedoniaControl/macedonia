export function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtBs(n: number): string {
  return `${new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(n)} Bs`;
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-VE").format(n);
}

export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}
