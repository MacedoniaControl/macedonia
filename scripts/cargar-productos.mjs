// Carga el catálogo de productos a Supabase.
//
//   node scripts/cargar-productos.mjs [--dry]
//
// Fuentes:
//   lib/ux/inventory-fisico-seed.json  -> códigos, nombres y unidades (Sumigases)
//   lib/ux/costos.ts                   -> costo y precio por código, POR EMPRESA
//
// IDEMPOTENTE: se puede correr las veces que haga falta. Usa upsert sobre
// (empresa_id, codigo), así que repetirlo actualiza en vez de duplicar.
//
// La existencia NO se carga aquí: en el modelo definitivo sale del kardex
// (tabla movimientos_inventario), no de una columna que se desincroniza.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DRY = process.argv.includes("--dry");

// ---------------------------------------------------------------- entorno
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const CLAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !CLAVE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const cabeceras = {
  apikey: CLAVE,
  Authorization: `Bearer ${CLAVE}`,
  "Content-Type": "application/json",
};

// ---------------------------------------------------------------- fuentes
const seed = JSON.parse(fs.readFileSync(path.join(RAIZ, "lib/ux/inventory-fisico-seed.json"), "utf8"));

// costos.ts es TypeScript: se extrae el objeto literal sin ejecutarlo.
const fuenteCostos = fs.readFileSync(path.join(RAIZ, "lib/ux/costos.ts"), "utf8");
const inicio = fuenteCostos.indexOf("{", fuenteCostos.indexOf("const TABLA"));
const fin = fuenteCostos.lastIndexOf("};");
const COSTOS = JSON.parse(fuenteCostos.slice(inicio, fin + 1));

// ---------------------------------------------------------------- armado
/** Un producto por (empresa, código). El seed solo trae Sumigases. */
function construir() {
  const porEmpresa = { sumigases: new Map(), sudematin: new Map() };

  // 1. El catálogo con nombres viene del export de Valery de Sumigases.
  for (const it of seed.items) {
    const codigo = String(it.codigo).trim();
    if (!codigo) continue;
    porEmpresa.sumigases.set(codigo, {
      empresa_id: "sumigases",
      codigo,
      nombre: String(it.nombre ?? "").trim() || codigo,
      unidad: String(it.undPpal ?? "").trim() || null,
      unidad_alt: String(it.undAlt ?? "").trim() || null,
      costo_unitario: 0,
      precio_unitario: 0,
      es_cilindro: false,
    });
  }

  // 2. Los costos y precios salen del historial de ventas, por empresa.
  //    Un código con costo pero sin ficha en el catálogo igual se crea: existió
  //    en una venta real, así que es un producto real.
  let sinNombre = 0;
  for (const [empresa, tabla] of Object.entries(COSTOS)) {
    if (!porEmpresa[empresa]) continue;
    for (const [codigo, cp] of Object.entries(tabla)) {
      const cod = String(codigo).trim();
      if (!cod) continue;
      const existente = porEmpresa[empresa].get(cod);
      if (existente) {
        existente.costo_unitario = Number(cp.c) || 0;
        existente.precio_unitario = Number(cp.p) || 0;
      } else {
        sinNombre++;
        porEmpresa[empresa].set(cod, {
          empresa_id: empresa,
          codigo: cod,
          nombre: cod, // sin ficha en el catálogo: el código es lo único que se sabe
          unidad: null,
          unidad_alt: null,
          costo_unitario: Number(cp.c) || 0,
          precio_unitario: Number(cp.p) || 0,
          es_cilindro: false,
        });
      }
    }
  }

  return { porEmpresa, sinNombre };
}

// ---------------------------------------------------------------- carga
async function subir(filas) {
  const LOTE = 500; // subir 3.800 filas de un tirón hace que el servidor corte
  let hechas = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const r = await fetch(`${URL_SB}/rest/v1/productos?on_conflict=empresa_id,codigo`, {
      method: "POST",
      headers: { ...cabeceras, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(lote),
    });
    if (!r.ok) {
      console.error(`\n  ✗ lote ${i}-${i + lote.length}: HTTP ${r.status}`);
      console.error("   ", (await r.text()).slice(0, 300));
      process.exit(1);
    }
    hechas += lote.length;
    process.stdout.write(`\r  subiendo… ${hechas}/${filas.length}`);
  }
  process.stdout.write("\n");
}

// ---------------------------------------------------------------- principal
const { porEmpresa, sinNombre } = construir();

console.log("Productos a cargar:");
for (const [empresa, mapa] of Object.entries(porEmpresa)) {
  const conCosto = [...mapa.values()].filter((p) => p.costo_unitario > 0).length;
  console.log(`  ${empresa.padEnd(12)} ${String(mapa.size).padStart(5)} productos · ${conCosto} con costo`);
}
console.log(`  (${sinNombre} códigos venían del historial de ventas sin ficha en el catálogo)`);

if (DRY) {
  console.log("\n--dry: no se subió nada.");
  process.exit(0);
}

for (const [empresa, mapa] of Object.entries(porEmpresa)) {
  if (mapa.size === 0) { console.log(`\n${empresa}: nada que subir.`); continue; }
  console.log(`\n${empresa}:`);
  await subir([...mapa.values()]);
}

// ---------------------------------------------------------------- comprobación
const r = await fetch(`${URL_SB}/rest/v1/productos?select=*`, {
  headers: { ...cabeceras, Prefer: "count=exact", Range: "0-0" },
});
const total = (r.headers.get("content-range") ?? "").split("/")[1];
console.log(`\n✓ productos en la base: ${total}`);
