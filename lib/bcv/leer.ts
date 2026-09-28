import https from "node:https";

// Lee la tasa del dólar de bcv.org.ve, del lado del servidor (el sitio no deja
// consultarlo desde el navegador, y su certificado TLS suele estar mal: se
// ignora la verificación, como antes).

export type LecturaBcv = { tasa: number; fechaValor: string | null };

function html(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      "https://www.bcv.org.ve/",
      { rejectUnauthorized: false, headers: { "User-Agent": "Mozilla/5.0 (Macedonia BCV)" }, timeout: 8000 },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("el BCV no respondió a tiempo")); });
  });
}

/** Saca la tasa y la fecha valor del HTML del BCV. Aparte, para poder probarla. */
export function extraerBcv(pagina: string): LecturaBcv | null {
  // <div id="dolar" ...> ... <strong>857,88760000</strong>
  const bloque = pagina.split('id="dolar"')[1] ?? "";
  const crudo = bloque.match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i)?.[1];
  const tasa = crudo ? Number(crudo.replace(/\./g, "").replace(",", ".")) : NaN;
  if (!Number.isFinite(tasa) || tasa <= 0) return null;
  // Fecha Valor: <span ... content="2026-09-29T00:00:00-04:00">Martes, 29 Septiembre 2026</span>
  const fechaValor = pagina.match(/Fecha Valor:\s*<span[^>]*content="(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
  return { tasa: Math.round(tasa * 10000) / 10000, fechaValor };
}

export async function leerBcv(): Promise<LecturaBcv> {
  const r = extraerBcv(await html());
  if (!r) throw new Error("No se pudo leer el valor del dólar en la página del BCV.");
  return r;
}
