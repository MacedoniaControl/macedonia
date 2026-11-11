import { test } from "node:test";
import assert from "node:assert/strict";
import { extraerUsdt } from "./leer.ts";

// Lo que importa de la página, como la publica usdt.com.ve (11-11-2026).
const pagina = `<script type="application/ld+json">{"@graph":[{"@type":"ExchangeRateSpecification","currency":"USDT","currentExchangeRate":{"@type":"UnitPriceSpecification","price":"1072.4995","priceCurrency":"VES"}}]}</script>
<span class="text-muted-foreground">Bs.</span><span class="rate-display rate-buy">1.072,50</span>
<span class="rate-display rate-sell">1.073,75</span>`;

test("lee la tasa USDT del dato estructurado, y la compra y la venta", () => {
  assert.deepEqual(extraerUsdt(pagina), { tasa: 1072.4995, compra: 1072.5, venta: 1073.75 });
});

test("sin el dato estructurado no inventa una tasa (aunque estén los precios)", () => {
  assert.equal(extraerUsdt(`<span class="rate-display rate-buy">1.072,50</span>`), null);
  assert.equal(extraerUsdt("<html>mantenimiento</html>"), null);
});

test("si la moneda no es bolívares, no es esta tasa", () => {
  assert.equal(extraerUsdt(`{"@type":"ExchangeRateSpecification","currency":"USDT","currentExchangeRate":{"price":"1.00","priceCurrency":"USD"}}`), null);
});

test("sin compra ni venta, igual trae la tasa", () => {
  assert.deepEqual(extraerUsdt(`{"@type":"ExchangeRateSpecification","currency":"USDT","currentExchangeRate":{"price":"1072.4995","priceCurrency":"VES"}}`),
    { tasa: 1072.4995, compra: null, venta: null });
});
