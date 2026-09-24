"use server";

// Conteo físico. Ver supabase/17-conteos.sql y 23-conteos-historial.sql para
// el modelo y sus porqués.
//
// El conteo NO corrige el inventario: deja constancia de lo que se contó. Al
// cerrar se numera (CF-AAAA-NNNNNN), se toma la existencia del sistema en ese
// momento y se archivan las actas en Excel y PDF. El ajuste lo aprueba un owner
// o admin por separado. Esas reglas las hace cumplir la BASE (funciones y
// disparadores de la 23): lo de aquí solo las llama.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getUsuarioSesion } from "@/lib/auth/sesion-servidor";
import { getEmpresa } from "@/lib/ux/empresas";
import { armarActa, valorizar, type Acta, type EventoActa } from "./acta.ts";
import { actaExcel, actaPdf, valorizadaExcel, valorizadaPdf } from "./acta-archivos.ts";
import { PLANILLA_75, ZONA_PLANILLA_75 } from "./planilla-75.ts";
import { ZONA_GENERAL } from "./alcance.ts";
import { todasLasFilas } from "../supabase/paginar.ts";

/** "23-09-2026 15:40", en hora de Venezuela. */
function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}
const fechaCorta = (d: string) => d.split("-").reverse().join("-");

// ---------------------------------------------------------------- tipos

export type Departamento = { codigo: string; nombre: string; seCuenta: boolean };

export type Conteo = {
  id: number;
  fecha: string;
  departamento: string | null;
  departamentoNombre: string | null;
  zona: string | null;
  /** Que se cuenta: un departamento, la planilla impresa, todo (consolidado), o nada definido. */
  origen: "departamento" | "planilla" | "general" | "libre";
  abiertoEn: string;
  renglones: number;
};

export type ItemPlanilla = { renglon: number; codigo: string; nombre: string; unidad: string; sistema: number; departamento: string | null };

export type LineaConteo = {
  codigo: string;
  cantidad: number;
  renglon: number | null;
  nombre: string | null;
  unidad: string | null;
  observacion: string | null;
};

export type ResumenConteo = {
  id: number;
  numero: string | null;
  fecha: string;
  departamento: string | null;
  departamentoNombre: string | null;
  zona: string | null;
  conto: string | null;
  cerrado: boolean;
  cerradoEn: string | null;
  ajuste: "pendiente" | "aprobado" | "rechazado" | "sin_diferencias" | null;
  ajusteNota: string | null;
  renglones: number;
  diferencias: number;
  articulosNuevos: number;
  tieneActas: boolean;
  tieneValorizada: boolean;
};

export type DetalleConteo = {
  resumen: ResumenConteo;
  acta: Acta;
  /** null = esta persona no puede ver costos. */
  valor: { faltantes: number; sobrantes: number; neto: number; sinCosto: number } | null;
};

export type TipoArchivo = "acta_pdf" | "acta_xlsx" | "valorizada_pdf" | "valorizada_xlsx";

const ETIQUETA_EVENTO: Record<string, string> = {
  abierto: "Conteo abierto", articulo_nuevo: "Artículo nuevo agregado", cerrado: "Conteo cerrado",
  acta_generada: "Acta generada", ajuste_aprobado: "Ajuste aprobado", ajuste_rechazado: "Ajuste rechazado",
  alcance: "Cambió lo que se cuenta",
};

function origenDe(departamento: string | null, zona: string | null): Conteo["origen"] {
  return departamento ? "departamento" : zona === ZONA_PLANILLA_75 ? "planilla" : zona === ZONA_GENERAL ? "general" : "libre";
}

// ---------------------------------------------------------------- permisos y catalogos

/** ¿Puede aprobar ajustes y ver el acta valorizada? Owner o admin, como en la base. */
export async function puedeAprobar(): Promise<boolean> {
  const u = await getUsuarioSesion();
  return !!u && (u.rol === "owner" || u.rol === "admin");
}

export async function departamentosDe(empresa: string): Promise<Departamento[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("departamentos").select("codigo, nombre, se_cuenta").eq("empresa_id", empresa).order("codigo");
  if (error) throw new Error(`No se pudieron leer los departamentos: ${error.message}`);
  return (data ?? []).map((d) => ({ codigo: d.codigo, nombre: d.nombre, seCuenta: d.se_cuenta }));
}

// ---------------------------------------------------------------- abrir y contar

/** El conteo abierto de esta empresa, si hay uno. */
export async function conteoAbierto(empresa: string): Promise<Conteo | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("conteos_resumen")
    .select("id, fecha, departamento, departamento_nombre, zona, abierto_en, renglones")
    .eq("empresa_id", empresa)
    .eq("cerrado", false)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id, fecha: data.fecha, departamento: data.departamento, departamentoNombre: data.departamento_nombre,
    zona: data.zona, abiertoEn: fechaHora(data.abierto_en), renglones: data.renglones,
    origen: origenDe(data.departamento, data.zona),
  };
}

/** Abre un conteo de un departamento, de la planilla impresa de 75, o de todo (consolidado). */
export async function abrirConteo(
  empresa: string,
  que: { departamento: string } | { planilla: true } | { general: true },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (await conteoAbierto(empresa)) return { ok: false, error: "Ya hay un conteo abierto: ciérralo o síguelo antes de abrir otro." };
  const sb = await createClient();
  const { data, error } = await sb
    .from("conteos")
    .insert({
      empresa_id: empresa,
      departamento: "departamento" in que ? que.departamento : null,
      zona: "planilla" in que ? ZONA_PLANILLA_75 : "general" in que ? ZONA_GENERAL : null,
      usuario_id: usuario.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: `No se pudo abrir el conteo: ${error?.message}` };
  return { ok: true, id: data.id };
}

type Cliente = Awaited<ReturnType<typeof createClient>>;
type ProdConteo = { codigo: string; nombre: string; unidad: string | null; departamento: string | null };

/**
 * Los productos que abarca un conteo, en el orden de la planilla.
 *
 * Nunca entran los que no se cuentan: servicios, fletes, recargas, y los
 * departamentos marcados (DIRECTO, ACTIVOS SUDEMATIN). El general va por
 * departamento y, dentro, por nombre: se recorre el galpon departamento por
 * departamento.
 */
async function productosDelConteo(cliente: Cliente | ReturnType<typeof createAdminClient>, empresa: string, c: { departamento: string | null; zona: string | null }): Promise<ProdConteo[]> {
  const sb = cliente as Cliente;
  const campos = "codigo, nombre, unidad, departamento";
  if (c.departamento) {
    return todasLasFilas<ProdConteo>((d, h, cuenta) =>
      sb.from("productos").select(campos, cuenta ? { count: "exact" } : undefined).eq("empresa_id", empresa)
        .eq("departamento", c.departamento!).eq("se_cuenta", true).order("nombre").order("codigo").range(d, h));
  }
  if (c.zona === ZONA_PLANILLA_75) {
    const { data } = await sb.from("productos").select(campos).eq("empresa_id", empresa).in("codigo", [...PLANILLA_75]);
    const P = new Map((data ?? []).map((p) => [p.codigo, p as ProdConteo]));
    return PLANILLA_75.map((cod) => P.get(cod) ?? { codigo: cod, nombre: cod, unidad: "", departamento: null });
  }
  if (c.zona === ZONA_GENERAL) {
    const [prods, fuera] = await Promise.all([
      todasLasFilas<ProdConteo>((d, h, cuenta) =>
        sb.from("productos").select(campos, cuenta ? { count: "exact" } : undefined).eq("empresa_id", empresa).eq("se_cuenta", true)
          .order("departamento", { nullsFirst: false }).order("nombre").order("codigo").range(d, h)),
      sb.from("departamentos").select("codigo").eq("empresa_id", empresa).eq("se_cuenta", false),
    ]);
    const no = new Set((fuera.data ?? []).map((x) => x.codigo));
    return prods.filter((p) => !p.departamento || !no.has(p.departamento));
  }
  return [];
}

/**
 * Lo que hay que contar, con el N° de renglon. La existencia viaja para el
 * «ver lo que dice el sistema», pero la pantalla la esconde por defecto: quien
 * cuenta no deberia verla.
 */
export async function planillaDe(empresa: string, conteo: Conteo): Promise<ItemPlanilla[]> {
  const sb = await createClient();
  const prods = await productosDelConteo(sb, empresa, conteo);
  const E = await existenciasDe(sb, empresa, prods.map((p) => p.codigo));
  return prods.map((p, i) => ({ renglon: i + 1, codigo: p.codigo, nombre: p.nombre, unidad: p.unidad ?? "", sistema: E.get(p.codigo) ?? 0, departamento: p.departamento }));
}

/**
 * Existencia de unos codigos. La vista suma movimientos: pedirla para los
 * 2.208 productos para mostrar 40 es trabajo tirado, asi que va en tandas que
 * caben en la direccion del pedido, todas a la vez. Para el general (casi todo
 * el catalogo) sale mas barato leerla entera.
 */
async function existenciasDe(sb: Cliente, empresa: string, codigos: string[]): Promise<Map<string, number>> {
  const E = new Map<string, number>();
  if (codigos.length > 600) {
    const quiero = new Set(codigos);
    const todo = await todasLasFilas<{ codigo: string; existencia: number }>((d, h, cuenta) =>
      sb.from("existencias").select("codigo, existencia", cuenta ? { count: "exact" } : undefined).eq("empresa_id", empresa).order("codigo").range(d, h));
    for (const e of todo) if (quiero.has(e.codigo)) E.set(e.codigo, Number(e.existencia));
    return E;
  }
  const tandas = [];
  for (let i = 0; i < codigos.length; i += 150) tandas.push(codigos.slice(i, i + 150));
  const r = await Promise.all(tandas.map((t) => sb.from("existencias").select("codigo, existencia").eq("empresa_id", empresa).in("codigo", t)));
  for (const { data, error } of r) {
    if (error) throw new Error(`No se pudo leer la existencia: ${error.message}`);
    for (const e of data ?? []) E.set(e.codigo, Number(e.existencia));
  }
  return E;
}

/**
 * Cambia lo que abarca un conteo abierto.
 *
 * Ampliar a todos los departamentos se puede siempre: lo ya anotado sigue ahi,
 * y se renumera para seguir el orden de la planilla general. Cambiar a OTRO
 * departamento solo si no hay nada anotado: lo contado del primero quedaria
 * como "fuera de planilla" en un conteo que no es el suyo.
 */
export async function cambiarAlcance(
  conteoId: number,
  empresa: string,
  a: { general: true } | { departamento: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await createClient();
  const { data: c } = await sb.from("conteos").select("departamento, zona, cerrado").eq("id", conteoId).eq("empresa_id", empresa).maybeSingle();
  if (!c) return { ok: false, error: "No existe ese conteo." };
  if (c.cerrado) return { ok: false, error: "El conteo ya está cerrado." };
  const { data: lineas, error: el } = await sb.from("conteo_lineas").select("codigo, renglon").eq("conteo_id", conteoId);
  if (el) return { ok: false, error: el.message };
  if ("departamento" in a && (lineas ?? []).length > 0) {
    return { ok: false, error: "Este conteo ya tiene cantidades anotadas: no se cambia de departamento. Amplíalo a todos los departamentos, o ciérralo y abre otro." };
  }
  const nuevo = "general" in a ? { departamento: null, zona: ZONA_GENERAL } : { departamento: a.departamento, zona: null };
  const { error } = await sb.from("conteos").update(nuevo).eq("id", conteoId);
  if (error) return { ok: false, error: `No se pudo cambiar: ${error.message}` };

  // Los renglones ya anotados toman su N° en la planilla nueva.
  if (lineas?.length) {
    const prods = await productosDelConteo(sb, empresa, nuevo);
    const N = new Map(prods.map((p, i) => [p.codigo, i + 1]));
    const cambian = lineas.filter((l) => (N.get(l.codigo) ?? null) !== l.renglon);
    const r = await Promise.all(cambian.map((l) => sb.from("conteo_lineas").update({ renglon: N.get(l.codigo) ?? null }).eq("conteo_id", conteoId).eq("codigo", l.codigo)));
    const mal = r.find((x) => x.error);
    if (mal) return { ok: false, error: `Se cambió, pero no se pudieron renumerar los renglones: ${mal.error!.message}` };
  }

  const codigos = [c.departamento, nuevo.departamento].filter((x): x is string => !!x);
  const { data: deps } = codigos.length
    ? await sb.from("departamentos").select("codigo, nombre").eq("empresa_id", empresa).in("codigo", codigos)
    : { data: [] as { codigo: string; nombre: string }[] };
  const D = new Map((deps ?? []).map((d) => [d.codigo, `${d.codigo} - ${d.nombre}`]));
  const nombre = (x: { departamento: string | null; zona: string | null }) => (x.departamento ? D.get(x.departamento) ?? x.departamento : x.zona ?? "Sin departamento");
  const usuario = await getUsuarioSesion();
  await createAdminClient().from("conteo_eventos").insert({
    conteo_id: conteoId, tipo: "alcance", usuario_id: usuario?.id ?? null,
    detalle: `Pasó de «${nombre(c)}» a «${nombre(nuevo)}».${lineas?.length ? ` Se conservan los ${lineas.length} renglón(es) ya anotados.` : ""}`,
  });
  return { ok: true };
}

export async function lineasDe(conteoId: number): Promise<LineaConteo[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("conteo_lineas")
    .select("codigo, cantidad, renglon, nombre, unidad, observacion")
    .eq("conteo_id", conteoId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer los renglones: ${error.message}`);
  return (data ?? []).map((l) => ({ ...l, cantidad: Number(l.cantidad) }));
}

/**
 * Anota lo contado de un producto.
 *
 * Si ya se había contado en esta sesión, el nuevo número PISA al anterior en vez
 * de sumarse: contar dos veces la misma estantería es un error de recorrido, no
 * el doble de mercadería.
 */
export async function anotar(
  conteoId: number,
  codigo: string,
  cantidad: number,
  extra: { renglon?: number | null; observacion?: string | null; nombre?: string | null; unidad?: string | null } = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!codigo.trim()) return { ok: false, error: "Falta el código." };
  if (!(cantidad >= 0)) return { ok: false, error: "La cantidad no puede ser negativa." };
  const usuario = await getUsuarioSesion();
  const sb = await createClient();
  const { error } = await sb.from("conteo_lineas").upsert(
    {
      conteo_id: conteoId, codigo: codigo.trim(), cantidad,
      renglon: extra.renglon ?? null, observacion: extra.observacion?.trim() || null,
      nombre: extra.nombre ?? null, unidad: extra.unidad ?? null, anotado_por: usuario?.id ?? null,
    },
    { onConflict: "conteo_id,codigo" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function borrarRenglon(conteoId: number, codigo: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.from("conteo_lineas").delete().eq("conteo_id", conteoId).eq("codigo", codigo);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Da de alta un articulo que no esta en Valery y lo anota en el conteo. El SKU
 * (MC-000001) lo asigna la base, que ademas rechaza un nombre que ya existe.
 */
export async function crearArticulo(
  conteoId: number,
  empresa: string,
  a: { nombre: string; unidad: string; departamento: string; nombreCorto?: string; marca?: string; modelo?: string; referencia?: string; cantidad: number; observacion?: string },
): Promise<{ ok: true; codigo: string } | { ok: false; error: string }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("crear_articulo_nuevo", {
    p_empresa: empresa, p_nombre: a.nombre, p_unidad: a.unidad, p_departamento: a.departamento,
    p_nombre_corto: a.nombreCorto || null, p_marca: a.marca || null, p_modelo: a.modelo || null, p_referencia: a.referencia || null,
  });
  if (error) return { ok: false, error: error.message };
  const codigo = data as string;
  const r = await anotar(conteoId, codigo, a.cantidad, { nombre: a.nombre.toUpperCase(), unidad: a.unidad, observacion: a.observacion });
  if (!r.ok) return { ok: false, error: `Se creó ${codigo}, pero no se pudo anotar: ${r.error}` };
  // El historial no lo escribe la app con la sesion del usuario (la base no lo
  // deja): va con el servicio, despues de que la base acepto el articulo.
  const usuario = await getUsuarioSesion();
  await createAdminClient().from("conteo_eventos").insert({
    conteo_id: conteoId, tipo: "articulo_nuevo", usuario_id: usuario?.id ?? null,
    detalle: `${codigo} · ${a.nombre.toUpperCase()}. No existe en Valery: recibió SKU de Macedonia.`,
  });
  return { ok: true, codigo };
}

// ---------------------------------------------------------------- cerrar

/**
 * Cierra el conteo y archiva sus actas.
 *
 * Cerrar lo hace la base (cerrar_conteo): numero, foto de la existencia y del
 * costo, y evento, en una sola transaccion. Las actas se generan despues; si
 * eso falla, el conteo queda cerrado igual y las actas se pueden volver a
 * generar desde el historial.
 */
export async function cerrarConteo(
  id: number,
  conto?: string,
): Promise<{ ok: boolean; error?: string; numero?: string; actas?: boolean; errorActas?: string }> {
  const sb = await createClient();

  const { data: lineas } = await sb.from("conteo_lineas").select("id").eq("conteo_id", id).limit(1);
  if (!lineas?.length) return { ok: false, error: "No se contó ningún producto todavía." };

  // Con la migracion 23, cerrar es cerrar_conteo(): asigna el numero CF, toma
  // la existencia del sistema en ese momento y deja el evento en el historial.
  // La base ya no deja cerrar cambiando el campo a mano.
  const r = await sb.rpc("cerrar_conteo", { p_conteo: id, p_conto: conto?.trim() || null });
  if (!r.error) {
    const g = await generarActas(id);
    return { ok: true, numero: r.data as string, actas: g.ok, errorActas: g.error };
  }
  // PGRST202 = la funcion no existe: la 23 no corrio todavia, se cierra como antes.
  if (r.error.code !== "PGRST202") return { ok: false, error: r.error.message };

  const { error } = await sb.from("conteos").update({ cerrado: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Arma el Acta de un conteo cerrado, leyendo con el servicio (lleva costos). */
async function actaDe(admin: ReturnType<typeof createAdminClient>, id: number) {
  const { data: c, error } = await admin.from("conteos").select("*").eq("id", id).single();
  if (error || !c) throw new Error(`No existe el conteo ${id}.`);
  const [lin, ev, cos, dep] = await Promise.all([
    admin.from("conteo_lineas").select("renglon, codigo, nombre, unidad, cantidad, existencia_sistema, observacion").eq("conteo_id", id),
    admin.from("conteo_eventos").select("en, tipo, detalle").eq("conteo_id", id).order("en"),
    admin.from("conteo_costos").select("codigo, costo_unitario").eq("conteo_id", id),
    c.departamento ? admin.from("departamentos").select("nombre").eq("empresa_id", c.empresa_id).eq("codigo", c.departamento).single() : Promise.resolve({ data: null }),
  ]);
  const departamento = c.departamento ? `${c.departamento} - ${(dep.data as { nombre: string } | null)?.nombre ?? ""}` : c.zona ?? "Sin departamento";
  const contados = new Set((lin.data ?? []).map((l) => l.codigo));

  // Lo que quedo sin contar, para la hoja "Sin contar" del Excel.
  const ex = await todasLasFilas<{ codigo: string; existencia: number }>((d, h, cuenta) =>
    admin.from("existencias").select("codigo, existencia", cuenta ? { count: "exact" } : undefined).eq("empresa_id", c.empresa_id).order("codigo").range(d, h));
  const E = new Map(ex.map((e) => [e.codigo, Number(e.existencia)]));
  const prods = await productosDelConteo(admin, c.empresa_id, c);
  const sinContar = prods.filter((p) => !contados.has(p.codigo)).map((p) => ({ codigo: p.codigo, nombre: p.nombre, unidad: p.unidad, sistema: E.get(p.codigo) ?? 0 }));

  const eventos: EventoActa[] = (ev.data ?? []).map((e) => ({ en: fechaHora(e.en), tipo: ETIQUETA_EVENTO[e.tipo] ?? e.tipo, detalle: e.detalle ?? "" }));
  if (c.ajuste === "pendiente") {
    const n = (lin.data ?? []).filter((l) => l.existencia_sistema !== null && Number(l.cantidad) !== Number(l.existencia_sistema)).length;
    eventos.push({ en: "Pendiente", tipo: "Ajuste de inventario", detalle: `${n} diferencia(s) esperan la aprobación del Owner o de un Administrador.` });
  }
  const acta = armarActa({
    numero: c.numero ?? "(sin número)", empresa: getEmpresa(c.empresa_id)?.nombre ?? c.empresa_id, departamento,
    fecha: fechaCorta(c.fecha), conto: c.conto ?? "—", abiertoEn: fechaHora(c.created_at), cerradoEn: fechaHora(c.cerrado_en),
    lineas: (lin.data ?? []).map((l) => ({ ...l, cantidad: Number(l.cantidad), existencia_sistema: l.existencia_sistema === null ? null : Number(l.existencia_sistema) })),
    eventos, sinContar,
  });
  const costos = new Map((cos.data ?? []).map((x) => [x.codigo, Number(x.costo_unitario)]));
  return { conteo: c, acta, costos };
}

/**
 * Genera y archiva las cuatro actas de un conteo cerrado. Se puede repetir: si
 * ya estan archivadas no hace nada, y un acta archivada no se reemplaza (la
 * base no lo deja).
 */
export async function generarActas(id: number): Promise<{ ok: boolean; error?: string }> {
  // Solo alguien que puede ver ese conteo dispara la generacion.
  const sb = await createClient();
  const { data: visible } = await sb.from("conteos").select("id, cerrado").eq("id", id).maybeSingle();
  if (!visible) return { ok: false, error: "No existe el conteo o no tienes acceso." };
  if (!visible.cerrado) return { ok: false, error: "El conteo sigue abierto: el acta se genera al cerrarlo." };

  const admin = createAdminClient();
  try {
    const { conteo: c, acta, costos } = await actaDe(admin, id);
    if (c.acta_pdf && c.acta_xlsx && c.valorizada_pdf && c.valorizada_xlsx) return { ok: true };
    const v = valorizar(acta, costos);
    const base = `${c.empresa_id}/${c.numero}`;
    const archivos: [TipoArchivo, string, Buffer, string][] = [
      ["acta_pdf", `${base}/acta.pdf`, await actaPdf(acta), "application/pdf"],
      ["acta_xlsx", `${base}/acta.xlsx`, await actaExcel(acta), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ["valorizada_pdf", `${base}/valorizada/valorizada.pdf`, await valorizadaPdf(v), "application/pdf"],
      ["valorizada_xlsx", `${base}/valorizada/valorizada.xlsx`, await valorizadaExcel(v), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ];
    const rutas: Partial<Record<TipoArchivo, string>> = {};
    for (const [tipo, ruta, buf, mime] of archivos) {
      if (c[tipo]) continue;
      const up = await admin.storage.from("actas").upload(ruta, buf, { contentType: mime, upsert: false });
      // "ya existe" = un intento anterior lo subio y fallo despues: se usa ese.
      if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(`No se pudo archivar ${ruta}: ${up.error.message}`);
      rutas[tipo] = ruta;
    }
    const { error: eu } = await admin.from("conteos").update(rutas).eq("id", id);
    if (eu) throw new Error(eu.message);
    await admin.from("conteo_eventos").insert({
      conteo_id: id, tipo: "acta_generada",
      detalle: "Excel y PDF archivados, común y valorizada. No se modifican: un error se corrige con un conteo nuevo.",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- historial

function aResumen(r: Record<string, unknown>): ResumenConteo {
  return {
    id: r.id as number, numero: r.numero as string | null, fecha: r.fecha as string,
    departamento: r.departamento as string | null, departamentoNombre: r.departamento_nombre as string | null,
    zona: r.zona as string | null, conto: r.conto as string | null, cerrado: r.cerrado as boolean,
    cerradoEn: r.cerrado_en ? fechaHora(r.cerrado_en as string) : null,
    ajuste: r.ajuste as ResumenConteo["ajuste"], ajusteNota: r.ajuste_nota as string | null,
    renglones: r.renglones as number, diferencias: r.diferencias as number, articulosNuevos: r.articulos_nuevos as number,
    tieneActas: !!(r.acta_pdf && r.acta_xlsx), tieneValorizada: !!(r.valorizada_pdf && r.valorizada_xlsx),
  };
}

export async function historial(empresa: string): Promise<ResumenConteo[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("conteos_resumen").select("*").eq("empresa_id", empresa).order("id", { ascending: false });
  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);
  return (data ?? []).map(aResumen);
}

/**
 * El conteo con su acta. Lo lee la sesion de quien mira; el costo solo llega
 * si la base se lo deja ver (owner o admin), asi que el valor viene en null
 * para los demas sin que la pantalla tenga que decidir nada.
 */
export async function detalleConteo(id: number): Promise<DetalleConteo> {
  const sb = await createClient();
  const { data: r, error } = await sb.from("conteos_resumen").select("*").eq("id", id).single();
  if (error || !r) throw new Error("No existe el conteo o no tienes acceso.");
  const [lin, ev, cos] = await Promise.all([
    sb.from("conteo_lineas").select("renglon, codigo, nombre, unidad, cantidad, existencia_sistema, observacion").eq("conteo_id", id),
    sb.from("conteo_eventos").select("en, tipo, detalle").eq("conteo_id", id).order("en"),
    sb.from("conteo_costos").select("codigo, costo_unitario").eq("conteo_id", id),
  ]);
  const resumen = aResumen(r);
  const eventos: EventoActa[] = (ev.data ?? []).map((e) => ({ en: fechaHora(e.en), tipo: ETIQUETA_EVENTO[e.tipo] ?? e.tipo, detalle: e.detalle ?? "" }));
  const acta = armarActa({
    numero: resumen.numero ?? "Sin número", empresa: getEmpresa(r.empresa_id)?.nombre ?? r.empresa_id,
    departamento: resumen.departamento ? `${resumen.departamento} - ${resumen.departamentoNombre ?? ""}` : resumen.zona ?? "Sin departamento",
    fecha: fechaCorta(resumen.fecha), conto: resumen.conto ?? "—", abiertoEn: fechaHora(r.abierto_en), cerradoEn: resumen.cerradoEn ?? "—",
    lineas: (lin.data ?? []).map((l) => ({ ...l, cantidad: Number(l.cantidad), existencia_sistema: l.existencia_sistema === null ? null : Number(l.existencia_sistema) })),
    eventos,
  });
  const verCostos = await puedeAprobar();
  const valor = verCostos && resumen.cerrado ? valorizar(acta, new Map((cos.data ?? []).map((x) => [x.codigo, Number(x.costo_unitario)]))).valor : null;
  return { resumen, acta, valor };
}

/**
 * Enlace de descarga de un acta, que vence en 5 minutos. Se firma con la
 * sesion de quien lo pide: la politica del bucket decide si puede, y la
 * valorizada solo se abre para owner y admin.
 */
export async function urlActa(id: number, tipo: TipoArchivo): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const sb = await createClient();
  const { data: c } = await sb.from("conteos").select(`numero, departamento, zona, fecha, ${tipo}`).eq("id", id).maybeSingle();
  const ruta = (c as Record<string, string | null> | null)?.[tipo];
  if (!c || !ruta) return { ok: false, error: "Esa acta todavía no está archivada." };
  const ext = tipo.endsWith("pdf") ? "pdf" : "xlsx";
  const nombre = `${c.numero}${tipo.startsWith("valorizada") ? " VALORIZADA" : ""}.${ext}`;
  const { data, error } = await sb.storage.from("actas").createSignedUrl(ruta, 300, { download: nombre });
  if (error || !data) return { ok: false, error: error?.message.includes("not found") || error?.message.includes("Object") ? "No tienes acceso a esa acta." : `No se pudo abrir: ${error?.message}` };
  return { ok: true, url: data.signedUrl };
}

export async function aprobarAjuste(id: number, nota?: string): Promise<{ ok: boolean; error?: string; movimientos?: number }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("aprobar_ajuste", { p_conteo: id, p_nota: nota?.trim() || null });
  if (error) return { ok: false, error: error.message };
  return { ok: true, movimientos: data as number };
}

export async function rechazarAjuste(id: number, nota: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.rpc("rechazar_ajuste", { p_conteo: id, p_nota: nota });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------- master

export type FilaMaster = {
  codigo: string;
  nombre: string;
  valery: number;
  contado: number | null;
  fechaConteo: string | null;
  zona: string | null;
  diferencia: number | null;
};

/**
 * Master: lo que dice el papel contra lo que alguien contó.
 *
 * `contado` en null significa NO CONTADO, que es distinto de contado en cero.
 * Mostrar un cero ahí inventaría un faltante que nadie verificó.
 */
export async function master(empresa: string): Promise<FilaMaster[]> {
  const sb = await createClient();

  const [prod, cont, ex] = await Promise.all([
    todasLasFilas<{ codigo: string; nombre: string }>((d, h, cuenta) => sb.from("productos").select("codigo, nombre", cuenta ? { count: "exact" } : undefined).eq("empresa_id", empresa).order("codigo").range(d, h)),
    todasLasFilas<{ codigo: string; cantidad: number; fecha: string; zona: string | null }>((d, h, cuenta) =>
      sb.from("ultimo_conteo").select("codigo, cantidad, fecha, zona", cuenta ? { count: "exact" } : undefined).eq("empresa_id", empresa).order("codigo").range(d, h)),
    todasLasFilas<{ codigo: string; existencia: number }>((d, h, cuenta) => sb.from("existencias").select("codigo, existencia", cuenta ? { count: "exact" } : undefined).eq("empresa_id", empresa).order("codigo").range(d, h)),
  ]).catch((e: Error) => { throw new Error(`No se pudo leer el Master: ${e.message}`); });

  const valeryDe = new Map(ex.map((e) => [e.codigo, Number(e.existencia)]));
  const contadoDe = new Map(cont.map((c) => [c.codigo, { n: Number(c.cantidad), fecha: c.fecha, zona: c.zona }]));

  return prod.map((p) => {
    const valery = valeryDe.get(p.codigo) ?? 0;
    const c = contadoDe.get(p.codigo);
    return {
      codigo: p.codigo,
      nombre: p.nombre,
      valery,
      contado: c ? c.n : null,
      fechaConteo: c ? c.fecha : null,
      zona: c ? c.zona : null,
      diferencia: c ? c.n - valery : null,
    };
  });
}
