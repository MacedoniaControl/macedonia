import https from "node:https";

// Consulta el tipo de cambio oficial del BCV (bcv.org.ve) del lado servidor (evita CORS).
// El sitio del BCV suele tener certificado TLS problemático → se ignora la verificación de cert.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBcvHtml(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      "https://www.bcv.org.ve/",
      {
        rejectUnauthorized: false,
        headers: { "User-Agent": "Mozilla/5.0 (SumiControl BCV bot)" },
        timeout: 12000,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("tiempo de espera agotado"));
    });
  });
}

export async function GET() {
  try {
    const html = await getBcvHtml();

    // Bloque del dólar: <div id="dolar" ...> ... <strong class="strong-tb">700,22490000</strong>
    const bloque = html.split('id="dolar"')[1] ?? "";
    const mDolar = bloque.match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i);
    const crudo = mDolar?.[1]?.trim() ?? null;
    const tasa = crudo ? Number(crudo.replace(/\./g, "").replace(",", ".")) : null;

    const mFecha = html.match(/Fecha Valor:\s*([^<]+)</i);
    const fecha = mFecha?.[1]?.trim() ?? null;

    if (!tasa || !isFinite(tasa)) {
      return Response.json({ ok: false, error: "No se pudo leer el valor del dólar del BCV." }, { status: 502 });
    }
    return Response.json({ ok: true, tasa: Math.round(tasa * 100) / 100, crudo, fecha });
  } catch (e) {
    return Response.json({ ok: false, error: `No se pudo consultar el BCV: ${String(e)}` }, { status: 502 });
  }
}
