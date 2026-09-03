// Pruebas del catálogo de permisos y las plantillas por rol.
// Aquí se decide qué ve cada persona: un fallo deja a alguien fuera de su
// trabajo, o le abre algo que no debía ver.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inicialesDe } from "./identidad.ts";
import { plantillaDeRol, claveDeRuta, puedeVer, CLAVES_MODULO, TODAS_LAS_CLAVES } from "./permisos.ts";

describe("plantillaDeRol", () => {
  test("ninguna plantilla deja al usuario sin ningun modulo", () => {
    for (const rol of ["owner", "admin", "vendedor", "tecnico"] as const) {
      const encendidos = Object.values(plantillaDeRol(rol)).filter(Boolean).length;
      assert.ok(encendidos > 0, `${rol} quedaria sin acceso a nada`);
    }
  });

  test("el vendedor ve operacion e inventario, no finanzas", () => {
    const p = plantillaDeRol("vendedor");
    assert.equal(p["quotes"], true);
    assert.equal(p["delivery-notes"], true);
    assert.equal(p["inventory"], true);
    assert.equal(p["products"], true);
    assert.equal(p["expenses"], false);
    assert.equal(p["receivables"], false);
  });

  test("el tecnico ve cilindros, inventario y catalogo, y nada mas", () => {
    // Antes decia SOLO cilindros. El conteo fisico -que es el trabajo del
    // almacen- vive detras del permiso `inventory`, asi que con la plantilla
    // vieja las dos personas de almacen abrian la pantalla en blanco.
    const p = plantillaDeRol("tecnico");
    const encendidos = Object.entries(p).filter(([, v]) => v).map(([k]) => k).sort();
    assert.deepEqual(encendidos, ["cylinders", "inventory", "products"]);
  });

  test("el admin ve todo de su empresa menos registros y usuarios", () => {
    const p = plantillaDeRol("admin");
    assert.equal(p["expenses"], true);
    assert.equal(p["receivables"], true);
    assert.equal(p["users"], false);
    assert.equal(p["ver_registros"], false);
  });

  test("el owner tiene absolutamente todo encendido", () => {
    assert.ok(Object.values(plantillaDeRol("owner")).every(Boolean));
  });

  test("toda plantilla define TODAS las claves, sin huecos", () => {
    for (const rol of ["owner", "admin", "vendedor", "tecnico"] as const) {
      const p = plantillaDeRol(rol);
      for (const c of TODAS_LAS_CLAVES) {
        assert.equal(typeof p[c], "boolean", `${rol} no define ${c}`);
      }
    }
  });
});

describe("claveDeRuta", () => {
  test("reconoce la ruta con empresa", () => {
    assert.equal(claveDeRuta("/admin/sumigases/expenses"), "expenses");
    assert.equal(claveDeRuta("/admin/sudematin/delivery-notes"), "delivery-notes");
  });

  test("reconoce la ruta consolidada", () => {
    assert.equal(claveDeRuta("/admin/inventory"), "inventory");
  });

  test("reconoce sub-rutas", () => {
    assert.equal(claveDeRuta("/admin/sumigases/inventory/movimientos"), "inventory");
  });

  test("no confunde una clave con el prefijo de otra", () => {
    // "sales" no debe capturar "/admin/sales-algo" ni al reves
    assert.equal(claveDeRuta("/admin/delivery-notes"), "delivery-notes");
  });

  test("devuelve null fuera del panel", () => {
    assert.equal(claveDeRuta("/login"), null);
    assert.equal(claveDeRuta("/"), null);
    assert.equal(claveDeRuta("/admin/"), null);
  });
});

describe("puedeVer", () => {
  test("el owner puede aunque tenga TODO apagado", () => {
    const ninguno = Object.fromEntries(TODAS_LAS_CLAVES.map((k) => [k, false]));
    assert.equal(puedeVer(ninguno, "owner", "expenses"), true);
    assert.equal(puedeVer({}, "owner", "users"), true);
  });

  test("los demas dependen de su permiso", () => {
    assert.equal(puedeVer({ expenses: true }, "vendedor", "expenses"), true);
    assert.equal(puedeVer({ expenses: false }, "vendedor", "expenses"), false);
    assert.equal(puedeVer({}, "admin", "expenses"), false);
  });
});

describe("CLAVES_MODULO", () => {
  // 16 desde que se eliminaron Auditoria y Comisiones y bonos (26-ago-2026).
  test("cubre las 16 secciones del menu", () => {
    assert.equal(CLAVES_MODULO.length, 16);
  });

  test("no tiene claves repetidas", () => {
    assert.equal(new Set(CLAVES_MODULO).size, CLAVES_MODULO.length);
  });

  test("ninguna clave lleva barras", () => {
    for (const c of CLAVES_MODULO) assert.ok(!c.includes("/"), `${c} lleva barra`);
  });
});

// El rol vivia en localStorage y por defecto era "owner": cualquiera podia
// escribirse otro rol desde la consola y ver secciones que no le tocan. Los
// datos nunca estuvieron expuestos -RLS es la barrera real- pero la interfaz
// mostraba de mas. Ahora lo resuelve el servidor; esto vigila que no vuelva.
describe("el rol no vuelve al navegador", () => {
  const sesion = fs.readFileSync("lib/ux/session.ts", "utf8");

  test("session.ts no lee ni escribe el navegador", () => {
    // Busca el USO, no la palabra: el archivo explica en un comentario de donde
    // viene el rol, y una prueba que mira vocabulario marca su propia
    // explicacion en vez del defecto.
    assert.doesNotMatch(sesion, /localStorage\s*\.\s*(getItem|setItem|removeItem)/);
  });

  test("no existe una forma de escribir el rol desde el cliente", () => {
    assert.doesNotMatch(sesion, /export function setRol/);
  });

  test("sin sesion cae al rol de MENOS permisos, no al de mas", () => {
    // El fallback estaba en "owner", que es al reves de lo que conviene.
    assert.match(sesion, /rol \?\? "tecnico"/);
    assert.doesNotMatch(sesion, /rol \?\? "owner"/);
  });
});

// `otra_empresa` no es una seccion mas: en puede_empresa() vale tanto como ser
// owner. Venia encendida en la plantilla de admin, o sea que cada admin nuevo
// nacia viendo las dos empresas. La separacion es la regla central del producto.
describe("la pared entre empresas", () => {
  test("ninguna plantilla salvo la del owner abre la otra empresa", () => {
    for (const rol of ["admin", "vendedor", "tecnico"] as const) {
      assert.equal(plantillaDeRol(rol).otra_empresa, false, `${rol} abre la pared`);
    }
  });

  test("el owner no necesita la clave: la pared no le aplica", () => {
    assert.equal(plantillaDeRol("owner").otra_empresa, true);
  });

  test("el admin conserva su empresa completa", () => {
    const p = plantillaDeRol("admin");
    for (const k of ["inventory", "cylinders", "expenses", "reports"]) {
      assert.equal(p[k], true, `admin perdio ${k}`);
    }
  });
});

test("el tecnico puede contar: el conteo fisico vive en inventory", () => {
  // La plantilla se escribio antes que el conteo, y el conteo -que es el
  // trabajo del almacen- quedo detras del permiso `inventory`. Almacen PLC y
  // Almacen Cumana abrian la pantalla en blanco.
  const p = plantillaDeRol("tecnico");
  assert.equal(p.inventory, true);
  assert.equal(p.cylinders, true);
  // Contar es elegir de un catalogo: sin `products`, master() no lee nada y la
  // pantalla de conteo queda vacia aunque `inventory` este encendido.
  assert.equal(p.products, true);
  assert.equal(p.expenses, false, "el tecnico no debe ver finanzas");
});

// El chip de usuario tenia "GV / Greeg V. / Owner" escrito a mano: no
// respondia al clic y le mostraba el nombre del dueño a cualquiera que
// entrara. Y `salir()` existia desde hacia tiempo sin que nadie la llamara,
// asi que no habia forma de cerrar sesion en toda la app.
describe("el menú de usuario", () => {
  const menu = fs.readFileSync("components/layout/MenuUsuario.tsx", "utf8");
  const header = fs.readFileSync("components/layout/Header.tsx", "utf8");

  test("no queda ningún nombre ni rol escrito a mano en la cabecera", () => {
    assert.doesNotMatch(header, /Greeg|">GV<|>Owner</);
  });

  test("la identidad sale de la sesión", () => {
    assert.match(menu, /useSesion\(\)/);
  });

  test("se puede cerrar sesión, y por el servidor", () => {
    assert.match(menu, /from "@\/app\/login\/actions"/);
    assert.match(menu, /<form action=\{salir\}>/);
  });

  test("sin sesión no dibuja un chip inventado", () => {
    assert.match(menu, /if \(!u\) return null;/);
  });

  // Una pantalla con sesion y sin salida deja a la persona encerrada: no puede
  // trabajar ni cambiar de usuario. El Centro de Control estuvo asi.
  test("toda pantalla con sesión ofrece una salida", () => {
    for (const ruta of [
      "app/CentroDeControl.tsx",
      "app/sin-acceso/page.tsx",
      "components/layout/Header.tsx",
    ]) {
      assert.match(fs.readFileSync(ruta, "utf8"), /MenuUsuario/, `${ruta} no tiene salida`);
    }
  });

  // `primeraSeccion` manda aqui a quien no puede ver nada. Si la ruta no
  // existe, esa persona cae en un 404 y ahi si que no hay salida.
  test("la ruta /sin-acceso existe de verdad", () => {
    assert.ok(fs.existsSync("app/sin-acceso/page.tsx"));
    const src = fs.readFileSync("lib/auth/sesion-servidor.ts", "utf8");
    assert.match(src, /"\/sin-acceso"/);
  });
});

// Las iniciales van en el chip: si dos personas comparten las suyas, el chip
// deja de identificar a nadie.
describe("inicialesDe", () => {
  test("toma la inicial de las dos primeras palabras", () => {
    assert.equal(inicialesDe("Greeg Vizcaino"), "GV");
    assert.equal(inicialesDe("Administración PLC"), "AP");
  });
  test("con una sola palabra usa sus dos primeras letras", () => {
    // Una inicial sola no distingue: Angie y Almacén serían la misma "A".
    assert.equal(inicialesDe("Angie"), "AN");
    assert.equal(inicialesDe("Leonardo"), "LE");
  });
  test("un nombre vacío no revienta el chip", () => {
    assert.equal(inicialesDe("   "), "?");
  });
});

// `restablecerPassword()` y `salir()` existieron mucho tiempo sin que ninguna
// pantalla las llamara. Una accion de servidor sin boton no existe para quien
// usa el sistema: Greeg no pudo arrancar el piloto por eso.
describe("las acciones de servidor llegan hasta la pantalla", () => {
  // No alcanza con que ALGUIEN llame a la accion: el componente que la llama
  // tiene que estar montado. Un componente escrito y nunca renderizado es lo
  // mismo que no tenerlo, y era justo lo que pasaba.
  const cadena = (accion: string, componente: string, montadoEn: string) => {
    const src = fs.readFileSync(componente, "utf8");
    assert.match(src, new RegExp(`\\b${accion}\\(`), `${componente} no llama a ${accion}`);
    const host = fs.readFileSync(montadoEn, "utf8");
    const nombre = componente.split("/").pop()!.replace(".tsx", "");
    assert.match(host, new RegExp(`<${nombre}[\\s/>]`), `${montadoEn} no monta <${nombre}>`);
  };

  test("restablecer contraseña llega hasta la tabla de usuarios", () => {
    cadena("restablecerPassword", "app/admin/users/RestablecerClave.tsx", "app/admin/users/UsuariosPanel.tsx");
  });

  test("cerrar sesión llega hasta la cabecera", () => {
    cadena("salir", "components/layout/MenuUsuario.tsx", "components/layout/Header.tsx");
  });
});
