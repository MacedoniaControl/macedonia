import { test } from "node:test";
import assert from "node:assert/strict";
import { extraerBcv } from "./leer.ts";

const pagina = `<div>Fecha Valor: <span class="date-display-single" property="dc:date" content="2026-09-29T00:00:00-04:00">Martes, 29 Septiembre 2026</span></div>
<div id="dolar" class="col-sm-12"><span> USD </span><strong> 857,88760000 </strong></div>`;

test("lee la tasa y la fecha valor del BCV", () => {
  assert.deepEqual(extraerBcv(pagina), { tasa: 857.8876, fechaValor: "2026-09-29" });
});

test("sin el bloque del dólar no inventa una tasa", () => {
  assert.equal(extraerBcv("<html>mantenimiento</html>"), null);
});

test("si no encuentra la fecha, igual trae la tasa", () => {
  assert.deepEqual(extraerBcv(`<div id="dolar"><strong>1.234,50</strong></div>`), { tasa: 1234.5, fechaValor: null });
});

import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../../supabase/30-tasa-bcv-automatica.sql", import.meta.url), "utf8");

test("30: la base pide la tasa cada 30 minutos con su clave", () => {
  assert.match(sql, /cron\.schedule\('tasa-bcv', '\*\/30 \* \* \* \*'/);
  assert.match(sql, /'x-bcv-token', \(select token from public\.bcv_token where id = 1\)/);
  assert.match(sql, /https:\/\/sumicontrol\.vercel\.app\/api\/bcv\/actualizar/);
});

test("30: la clave no la ve nadie de la app y la tasa la lee cualquiera con sesión", () => {
  assert.match(sql, /revoke all on public\.bcv_token from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy \w+ on public\.bcv_token/);
  assert.match(sql, /create policy tasas_bcv_lectura on public\.tasas_bcv for select to authenticated/);
});
