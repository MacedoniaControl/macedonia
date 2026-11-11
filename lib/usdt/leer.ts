// Lee la tasa USDT/Bs de usdt.com.ve, del lado del servidor.
//
// Pedido del usuario (11-11-2026): junto a la Tasa BCV, arriba de todas las
// pantallas, la del USDT. usdt.com.ve es un índice de referencia que junta los
// precios públicos P2P de Binance y Bybit y los actualiza cada 5 minutos.
//
// Se lee el dato estructurado que la página publica para buscadores
// («ExchangeRateSpecification», USDT → VES): no depende del diseño. Aparte, si
// están, el precio de compra y el de venta. Si no está el dato, no se inventa:
// la lectura falla y se dice.

export type LecturaUsdt = { tasa: number; compra: number | null; venta: number | null };

/** «1.072,50» → 1072.5 */
const deBolivares = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Saca la tasa del HTML de usdt.com.ve. Aparte, para poder probarla. */
export function extraerUsdt(pagina: string): LecturaUsdt | null {
  // {"@type":"ExchangeRateSpecification","currency":"USDT","currentExchangeRate":{...,"price":"1072.4995","priceCurrency":"VES"}}
  const bloque = pagina.match(/"@type"\s*:\s*"ExchangeRateSpecification"[^{}]*"currency"\s*:\s*"USDT"[^{}]*\{([^{}]*)\}/)?.[1] ?? "";
  if (!/"priceCurrency"\s*:\s*"VES"/.test(bloque)) return null;
  const tasa = Number(bloque.match(/"price"\s*:\s*"?([\d.]+)"?/)?.[1]);
  if (!Number.isFinite(tasa) || tasa <= 0) return null;
  const celda = (clase: string) => {
    const t = pagina.match(new RegExp(`class="[^"]*\\brate-display\\b[^"]*\\b${clase}\\b[^"]*"[^>]*>\\s*([\\d.,]+)\\s*<`))?.[1];
    const n = t ? deBolivares(t) : NaN;
    return Number.isFinite(n) && n > 0 ? r4(n) : null;
  };
  return { tasa: r4(tasa), compra: celda("rate-buy"), venta: celda("rate-sell") };
}

export async function leerUsdt(): Promise<LecturaUsdt> {
  const res = await fetch("https://www.usdt.com.ve/", {
    headers: { "User-Agent": "Mozilla/5.0 (Macedonia tasa USDT)" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`usdt.com.ve respondió ${res.status}.`);
  const r = extraerUsdt(await res.text());
  if (!r) throw new Error("No se pudo leer la tasa USDT en usdt.com.ve.");
  return r;
}
