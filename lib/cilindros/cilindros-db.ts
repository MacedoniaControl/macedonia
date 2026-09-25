"use server";

// Cilindros. Ver supabase/11-cilindros.sql para el modelo y sus porqués.
//
// Se cuentan por cantidad, son de la empresa (comodato), y el técnico registra
// la entrega: cuántos llenos deja y cuántos vacíos trae. NO tienen por qué
// coincidir — puede dejar 5 y traer 3, y el saldo del cliente sube 2.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getUsuarioSesion, puedeEntrarAEmpresa, sesionPuede, type UsuarioSesion } from "@/lib/auth/sesion-servidor";
import { normalizarCliente, planEntrega } from "./entrega.ts";
import { cargaConteo, ESTADOS_RAMPA, type EstadoRampa, type LineaConteoRampa, type RenglonConteo } from "./rampa.ts";

export type EstadoCilindro = "lleno" | "vacio" | "en_cliente" | "en_llenado" | "fuera_servicio";

const ETIQUETA: Record<EstadoCilindro, string> = { lleno: "lleno", vacio: "vacío", en_cliente: "en cliente", en_llenado: "en llenado", fuera_servicio: "fuera de servicio" };

export type Gas = {
  nombre: string;
  seRellena: boolean;
  depositoUsd: number;
};

export type SaldoCilindro = {
  gas: string;
  estado: EstadoCilindro;
  cantidad: number;
};

export type Comodato = {
  cliente: string;
  gas: string;
  enPoder: number;
  desde: string | null;
  dias: number | null;
};

/** Una línea de la entrega: por cada gas, cuántos se dejan y cuántos se traen. */
export type LineaEntrega = {
  gas: string;
  llenosEntregados: number;
  vaciosRecibidos: number;
};

export async function gases(empresa: string): Promise<Gas[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("gases")
    .select("nombre, se_rellena, deposito_usd")
    .eq("empresa_id", empresa)
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error(`No se pudieron leer los gases: ${error.message}`);
  type Fila = { nombre: string; se_rellena: boolean; deposito_usd: number };
  return ((data as Fila[] | null) ?? []).map((g) => ({
    nombre: g.nombre,
    seRellena: g.se_rellena,
    depositoUsd: Number(g.deposito_usd) || 0,
  }));
}

export async function saldos(empresa: string): Promise<SaldoCilindro[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("cilindros_saldo")
    .select("gas, estado, cantidad")
    .eq("empresa_id", empresa);

  if (error) throw new Error(`No se pudieron leer los saldos: ${error.message}`);
  type Fila = { gas: string; estado: EstadoCilindro; cantidad: number };
  return ((data as Fila[] | null) ?? []).map((s) => ({
    gas: s.gas,
    estado: s.estado,
    cantidad: Number(s.cantidad) || 0,
  }));
}

export async function comodatos(empresa: string): Promise<Comodato[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("comodato_cliente")
    .select("cliente, gas, en_poder, desde, dias")
    .eq("empresa_id", empresa)
    .order("dias", { ascending: false, nullsFirst: false });

  if (error) throw new Error(`No se pudo leer el comodato: ${error.message}`);
  type Fila = { cliente: string; gas: string; en_poder: number; desde: string | null; dias: number | null };
  return ((data as Fila[] | null) ?? []).map((c) => ({
    cliente: c.cliente,
    gas: c.gas,
    enPoder: Number(c.en_poder) || 0,
    desde: c.desde,
    dias: c.dias === null ? null : Number(c.dias),
  }));
}

type Sb = Awaited<ReturnType<typeof createClient>>;

/** Cuántos hay de cada gas en un estado. Lo lee también el Técnico (la 26 lo calcula en una función). */
async function enEstado(sb: Sb, empresa: string, estado: EstadoCilindro): Promise<Record<string, number>> {
  const { data, error } = await sb.from("cilindros_saldo").select("gas, cantidad").eq("empresa_id", empresa).eq("estado", estado);
  if (error) throw new Error(`No se pudieron leer los saldos: ${error.message}`);
  return Object.fromEntries((data ?? []).map((x) => [x.gas as string, Number(x.cantidad) || 0]));
}

/** Cuántos cilindros de cada gas tiene un cliente, según los movimientos. */
async function enPoder(sb: Sb, empresa: string, cliente: string): Promise<Record<string, number>> {
  const { data, error } = await sb.from("comodato_cliente").select("cliente, gas, en_poder").eq("empresa_id", empresa);
  if (error) throw new Error(`No se pudo leer el comodato: ${error.message}`);
  const k = normalizarCliente(cliente);
  const r: Record<string, number> = {};
  for (const x of data ?? []) if (normalizarCliente(x.cliente) === k) r[x.gas] = (r[x.gas] ?? 0) + (Number(x.en_poder) || 0);
  return r;
}

/** Para la pantalla: lo que tiene el cliente, mientras se escribe su nombre. */
export async function cilindrosDelCliente(empresa: string, cliente: string): Promise<Record<string, number>> {
  if (normalizarCliente(cliente).length < 2) return {};
  return enPoder(await createClient(), empresa, cliente);
}

/** Sugerencias de cliente: primero los que ya tienen cilindros, después el directorio. */
export async function sugerirClientes(empresa: string, q: string): Promise<string[]> {
  const t = normalizarCliente(q);
  if (t.length < 2) return [];
  const sb = await createClient();
  const [co, dir] = await Promise.all([
    sb.from("comodato_cliente").select("cliente").eq("empresa_id", empresa).ilike("cliente", `%${t.replace(/[%_]/g, "")}%`).limit(8),
    sb.from("clientes").select("nombre").eq("activo", true).ilike("nombre", `%${t.replace(/[%_]/g, "")}%`).limit(8),
  ]);
  const nombres = [...(co.data ?? []).map((x) => x.cliente as string), ...(dir.data ?? []).map((x) => x.nombre as string)].map(normalizarCliente);
  return [...new Set(nombres)].slice(0, 10);
}

const esGerenciaU = (u: UsuarioSesion) => u.rol === "owner" || u.rol === "admin";

/**
 * Registra una visita o un retiro en planta: por cada gas, los llenos que
 * se dejan y los vacíos que se traen. Reemplaza a «Declarar salida», que
 * hacía lo mismo con los llenos por otra puerta.
 *
 * Si se dejan llenos, hacen falta quién autoriza (Owner o Administrador) y
 * quién se los lleva: sin esos dos nombres, un cilindro que no vuelve no
 * tiene a quién reclamarse (la base lo exige desde la migración 19; antes
 * esta función no los mandaba y toda entrega con llenos fallaba).
 */
export async function registrarEntrega(
  cliente: string,
  lineas: LineaEntrega[],
  empresa: string,
  extra: { autorizadoPor?: string | null; retiradoPor?: string | null; documento?: string | null } = {},
): Promise<{ ok: true; movimientos: number; avisos: string[] } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  const nombre = normalizarCliente(cliente);
  if (!nombre) return { ok: false, error: "Falta el cliente." };
  const utiles = lineas.filter((l) => l.llenosEntregados > 0 || l.vaciosRecibidos > 0);
  if (utiles.length === 0) return { ok: false, error: "No has cargado ningún cilindro." };

  const dejaLlenos = utiles.some((l) => l.llenosEntregados > 0);
  if (dejaLlenos) {
    if (!extra.autorizadoPor) return { ok: false, error: "Elige quién autoriza que salgan los llenos." };
    if (!extra.retiradoPor?.trim()) return { ok: false, error: "Indica quién se lleva los cilindros." };
    const permitidos = await autorizantes(empresa);
    if (!permitidos.some((a) => a.id === extra.autorizadoPor)) return { ok: false, error: "Quien autoriza tiene que ser el Owner o un Administrador." };
  }

  const sb = await createClient();
  const [llenos, tiene] = await Promise.all([enEstado(sb, empresa, "lleno"), enPoder(sb, empresa, nombre)]);
  const plan = planEntrega(utiles, llenos, tiene);
  if (plan.errores.length) return { ok: false, error: `${plan.errores.join(" ")} Si en planta hay más, pídele al Administrador que ajuste el parque.` };

  const filas = plan.movimientos.map((m) => ({
    empresa_id: empresa, gas: m.gas, cantidad: m.cantidad, estado_desde: m.desde, estado_hacia: m.hacia,
    // También en el alta del vacío devuelto sin figurar: la base exige saber
    // de quién vino para dejar que el Técnico la registre (migración 27).
    cliente: nombre,
    documento: extra.documento?.trim() || null,
    // El alta de un vacío que el cliente devolvió sin figurar: se anota de quién vino.
    nota: m.desde === null ? `${m.nota} Cliente: ${nombre}.` : null,
    usuario_id: usuario.id,
    ...(m.hacia === "en_cliente" ? { autorizado_por: extra.autorizadoPor, retirado_por: extra.retiradoPor!.trim() } : {}),
  }));
  const { error } = await sb.from("cilindros_mov").insert(filas);
  if (error) return { ok: false, error: `No se pudo registrar la entrega: ${error.message}` };
  return { ok: true, movimientos: filas.length, avisos: plan.avisos };
}

/** Alta de cilindros al parque (compra). Sin estado previo: entran de la nada. */
export async function ingresarCilindros(
  gas: string,
  cantidad: number,
  estado: "lleno" | "vacio",
  empresa: string,
  nota?: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  // Cilindros nuevos en el parque son un activo que entra: como las compras
  // y los movimientos del inventario, lo registran el Owner o un Administrador.
  if (!esGerenciaU(usuario)) return { ok: false, error: "Dar de alta cilindros lo hace el Owner o un Administrador." };
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor que cero." };

  const sb = await createClient();
  const { error } = await sb.from("cilindros_mov").insert({
    empresa_id: empresa, gas, cantidad,
    estado_desde: null, estado_hacia: estado,
    nota: nota?.trim() || "Alta de cilindros", usuario_id: usuario.id,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Cambio de estado dentro del almacén: llenado, baja por daño, etc. */
export async function cambiarEstado(
  gas: string,
  cantidad: number,
  desde: EstadoCilindro,
  hacia: EstadoCilindro,
  empresa: string,
  nota?: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (desde === hacia) return { ok: false, error: "El estado de origen y destino son el mismo." };
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor que cero." };
  // Los que están en clientes se mueven con la entrega, que sabe de quién son.
  if (desde === "en_cliente" || hacia === "en_cliente") return { ok: false, error: "Los cilindros de clientes se mueven con «Registrar entrega»." };
  if (hacia === "fuera_servicio" && !nota?.trim()) return { ok: false, error: "Indica qué daño tiene: un cilindro fuera de servicio sin motivo no se puede reclamar ni reparar." };

  const sb = await createClient();
  const hay = (await enEstado(sb, empresa, desde))[gas] ?? 0;
  if (cantidad > hay) return { ok: false, error: `Solo hay ${hay} cilindro(s) de ${gas} en «${ETIQUETA[desde]}».` };
  const { error } = await sb.from("cilindros_mov").insert({
    empresa_id: empresa, gas, cantidad,
    estado_desde: desde, estado_hacia: hacia,
    nota: nota?.trim() || null, usuario_id: usuario.id,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type ConteoRampa = {
  id: number;
  numero: string;
  creadoEn: string;
  creadoNombre: string;
  motivo: string;
  estado: "pendiente" | "aprobado" | "rechazado";
  resueltoEn: string | null;
  resueltoNombre: string | null;
  resueltoNota: string | null;
  movimientos: number | null;
  renglones: RenglonConteo[];
};

/**
 * Envía un conteo de la Rampa a aprobación. No toca el parque: eso pasa
 * cuando el Owner o un Administrador lo aprueba en el Historial.
 * Lo pueden enviar Owner, Administrador y Técnico (registrar_conteo_cilindros).
 */
export async function contarRampa(
  empresa: string,
  lineas: LineaConteoRampa[],
  motivo: string,
): Promise<{ ok: true; numero: string; diferencias: number } | { ok: false; error: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };
  if (!motivo.trim()) return { ok: false, error: "Explica por qué no cuadra: queda en el historial." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("registrar_conteo_cilindros", {
    p_empresa: empresa, p_lineas: cargaConteo(lineas), p_motivo: motivo.trim(),
  });
  if (error) return { ok: false, error: error.message };
  const fila = (Array.isArray(data) ? data[0] : data) as { numero: string; diferencias: number } | undefined;
  return { ok: true, numero: fila?.numero ?? "", diferencias: fila?.diferencias ?? 0 };
}

/** Conteos de la Rampa, del más reciente al más antiguo, con sus renglones. */
export async function conteosRampa(empresa: string, limite = 50): Promise<ConteoRampa[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("cilindros_conteos")
    .select("id, numero, creado_en, creado_nombre, motivo, estado, resuelto_en, resuelto_nombre, resuelto_nota, movimientos, cilindros_conteo_lineas(gas, estado, sistema, contado)")
    .eq("empresa_id", empresa)
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`No se pudieron leer los conteos: ${error.message}`);
  type Fila = {
    id: number; numero: string; creado_en: string; creado_nombre: string; motivo: string; estado: ConteoRampa["estado"];
    resuelto_en: string | null; resuelto_nombre: string | null; resuelto_nota: string | null; movimientos: number | null;
    cilindros_conteo_lineas: { gas: string; estado: EstadoRampa; sistema: number; contado: number }[];
  };
  const orden = (e: EstadoRampa) => ESTADOS_RAMPA.indexOf(e);
  return ((data as Fila[] | null) ?? []).map((c) => ({
    id: c.id, numero: c.numero, creadoEn: c.creado_en, creadoNombre: c.creado_nombre, motivo: c.motivo, estado: c.estado,
    resueltoEn: c.resuelto_en, resueltoNombre: c.resuelto_nombre, resueltoNota: c.resuelto_nota, movimientos: c.movimientos,
    renglones: [...(c.cilindros_conteo_lineas ?? [])]
      .sort((a, b) => a.gas.localeCompare(b.gas) || orden(a.estado) - orden(b.estado))
      .map((l) => ({ gas: l.gas, estado: l.estado, sistema: Number(l.sistema), contado: Number(l.contado) })),
  }));
}

/** Aprueba un conteo: cada diferencia pasa a ser un movimiento del parque. */
export async function aprobarConteoRampa(id: number, nota?: string): Promise<{ ok: true; movimientos: number } | { ok: false; error: string }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("aprobar_conteo_cilindros", { p_id: id, p_nota: nota?.trim() || null });
  return error ? { ok: false, error: error.message } : { ok: true, movimientos: Number(data) || 0 };
}

/** Rechaza un conteo con motivo. El parque no cambia. */
export async function rechazarConteoRampa(id: number, nota: string): Promise<{ ok: boolean; error?: string }> {
  if (!nota.trim()) return { ok: false, error: "Indica por qué se rechaza: sin motivo nadie sabe qué recontar." };
  const sb = await createClient();
  const { error } = await sb.rpc("rechazar_conteo_cilindros", { p_id: id, p_nota: nota.trim() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Alta o edición de un gas y su depósito en garantía.
 *
 * Hoy el depósito es 0 en todos los gases y eso es CORRECTO: Greeg confirmo el
 * 02-sep-2026 que no se cobra garantia. `garantias_cliente` devuelve vacio
 * porque no hay garantias que mostrar, no porque falte cargar un dato.
 *
 * Si algun dia se cobra, ademas de cargar el monto aquí hay que hacer que el
 * movimiento lo registre: hoy `registrarEntrega` y `registrarSalida` insertan
 * con `deposito_usd` en su valor por defecto, o sea cero. Cargar el monto solo
 * en el gas no alcanzaria.
 *
 * Se edita desde la pantalla y no se carga por SQL porque el precio del gas
 * cambia, y cada cambio no puede depender de que alguien escriba una consulta.
 */
export async function guardarGas(
  g: { nombre: string; depositoUsd: number; seRellena: boolean; activo?: boolean },
  empresa: string,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await getUsuarioSesion();
  if (!usuario) return { ok: false, error: "Sin sesión." };

  const nombre = g.nombre.trim().toUpperCase();
  if (!nombre) return { ok: false, error: "Falta el nombre del gas." };
  if (!(g.depositoUsd >= 0)) return { ok: false, error: "El depósito no puede ser negativo." };

  const sb = await createClient();
  const { error } = await sb.from("gases").upsert(
    {
      empresa_id: empresa,
      nombre,
      deposito_usd: g.depositoUsd,
      se_rellena: g.seRellena,
      activo: g.activo ?? true,
    },
    { onConflict: "empresa_id,nombre" },
  );

  if (error) return { ok: false, error: `No se pudo guardar: ${error.message}` };
  return { ok: true };
}

/**
 * Baja lógica de un gas.
 *
 * No se borra: los movimientos históricos lo nombran, y borrarlo dejaría
 * huérfano todo lo que ya pasó por él.
 */
export async function desactivarGas(nombre: string, empresa: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb
    .from("gases")
    .update({ activo: false })
    .eq("empresa_id", empresa)
    .eq("nombre", nombre);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Un usuario que puede figurar como autorizante de una salida. */
export type Autorizante = { id: string; nombre: string; rol: string };

export async function autorizantes(empresa: string): Promise<Autorizante[]> {
  // Quien registra (el Técnico) solo puede leer su propia fila en usuarios:
  // la lista salía vacía y nadie podía declarar una salida. Se lee con el
  // servidor, y solo para quien opera cilindros en esa empresa.
  const u = await getUsuarioSesion();
  if (!u || !sesionPuede(u, "cylinders") || !puedeEntrarAEmpresa(u, empresa)) return [];
  const { data, error } = await createAdminClient()
    .from("usuarios")
    .select("id, nombre, rol, empresa_id, activo")
    .in("rol", ["owner", "admin"])
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error(`No se pudieron leer los autorizantes: ${error.message}`);
  type Fila = { id: string; nombre: string; rol: string; empresa_id: string | null };
  return ((data as Fila[] | null) ?? [])
    // empresa_id null = owner, entra a todas las empresas.
    .filter((u) => u.empresa_id === null || u.empresa_id === empresa)
    .map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol }));
}

// ---------------------------------------------------------------- historial (Owner y Administrador)

export type MovCilindro = {
  id: number;
  fecha: string;
  registradoEn: string;
  gas: string;
  cantidad: number;
  desde: EstadoCilindro | null;
  hacia: EstadoCilindro | null;
  cliente: string | null;
  documento: string | null;
  nota: string | null;
  retiradoPor: string | null;
  registro: string | null;
  autorizo: string | null;
  /** Lo que se corrigió, con quién y cuándo. */
  edicion: string | null;
  /** Eliminado: queda como la línea «Se eliminó … · Por … · fecha». */
  eliminado: { en: string; por: string } | null;
};

const fechaHoraVE = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
};

/** Todos los movimientos de cilindros, del más reciente al más viejo. La base solo se los da al Owner y al Administrador. */
export async function historialCilindros(empresa: string): Promise<MovCilindro[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("cilindros_historial")
    .select("*")
    .eq("empresa_id", empresa)
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);
  return (data ?? []).map((m) => ({
    id: m.id, fecha: m.fecha, registradoEn: fechaHoraVE(m.created_at), gas: m.gas, cantidad: Number(m.cantidad),
    desde: m.estado_desde, hacia: m.estado_hacia, cliente: m.cliente, documento: m.documento, nota: m.nota,
    retiradoPor: m.retirado_por, registro: m.registro, autorizo: m.autorizo, edicion: m.edicion,
    eliminado: m.eliminado_en ? { en: fechaHoraVE(m.eliminado_en), por: m.eliminado_nombre ?? "Un usuario" } : null,
  }));
}

export async function editarMovCilindro(
  id: number,
  cambios: { cantidad?: number; cliente?: string | null; documento?: string | null; retirado_por?: string | null; nota?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  if (cambios.cantidad !== undefined && !(Number.isInteger(cambios.cantidad) && cambios.cantidad > 0)) {
    return { ok: false, error: "La cantidad tiene que ser un número entero mayor que cero." };
  }
  const sb = await createClient();
  const { error } = await sb.rpc("editar_mov_cilindro", { p_id: id, p_cambios: cambios });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function eliminarMovCilindro(id: number): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.rpc("eliminar_mov_cilindro", { p_id: id });
  return error ? { ok: false, error: error.message } : { ok: true };
}
