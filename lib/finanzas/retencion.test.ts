import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { retencionDe, PCT_RETENCION, CLASES, claseDeDocumento, grupoDeClase, desglosar, revisarDesglose, parteExenta } from "./retencion.ts";

// El IVA retenido es el 75% del IVA de la cuenta: el comprador lo retiene y se
// lo entera al SENIAT, asi que al proveedor le paga el total MENOS eso.
describe("retención de IVA", () => {
  test("es el 75% del IVA", () => {
    assert.equal(PCT_RETENCION, 0.75);
    assert.equal(retencionDe(100, true), 75);
    assert.equal(retencionDe(57.46, true), 43.1);   // 43.095 redondeado
  });

  test("sin IVA no hay nada que retener", () => {
    // Las 40 cuentas ya cargadas no traen IVA: los archivos de Angy solo
    // daban el total. Devolver cero es correcto; inventarlo no.
    assert.equal(retencionDe(null, true), 0);
    assert.equal(retencionDe(0, true), 0);
  });

  test("una cuenta que no retiene no retiene aunque tenga IVA", () => {
    // Una nota de entrega no es documento fiscal. Greeg pidio poder decirlo
    // cuenta por cuenta.
    assert.equal(retencionDe(100, false), 0);
  });

  test("redondea a centimos: un tercer decimal no existe en dinero", () => {
    assert.equal(retencionDe(33.33, true), 25);      // 24.9975
    assert.equal(retencionDe(10.01, true), 7.51);    // 7.5075
  });
});

describe("clases de documento", () => {
  test("NDE es nota de débito, no de entrega", () => {
    // Confirmado por Greeg. En las cuentas por COBRAR el prefijo de nota de
    // entrega es NE; NDE es otra cosa, y confundirlas clasificaria mal las 11
    // cuentas que ya estan cargadas con ese prefijo.
    const sql = fs.readFileSync("supabase/21-cuentas-historial.sql", "utf8");
    assert.match(sql, /documento like 'NDE-%'[\s\S]{0,40}nota_debito|clase = 'nota_debito'\s+where[^;]*'NDE-%'/);
    assert.doesNotMatch(sql, /clase = 'nota_entrega'\s+where clase is null and documento like 'NDE-%'/);
  });

  test("están las clases que pueden aparecer", () => {
    // `ajuste` entro despues: hay dos filas cargadas que son un saldo anterior
    // sin documento, y llamarlas factura seria inventar un papel.
    assert.deepEqual(CLASES.map((c) => c.id),
      ["factura", "nota_entrega", "nota_debito", "nota_credito", "ajuste"]);
  });
});

describe("cerrar una cuenta", () => {
  const src = fs.readFileSync("lib/finanzas/cuentas-db.ts", "utf8");

  test("cerrar con saldo pendiente exige explicación", () => {
    // Dentro de seis meses nadie se acuerda de por que se cerro debiendo.
    assert.match(src, /como === "abono" && !nota\?\.trim\(\)/);
  });

  test("no se puede cerrar como pago total si queda saldo", () => {
    assert.match(src, /como === "total" && saldo > 0\.009/);
  });

  test("si el abono falla, el comprobante no se queda huérfano", () => {
    assert.match(src, /if \(ruta\) await sb\.storage\.from\(BUCKET_COMPROBANTES\)\.remove/);
  });

  test("editar no puede dejar el monto por debajo de lo abonado", () => {
    assert.match(src, /c\.monto < abonado/);
  });
});

// Greeg: "las 40 cuentas que existen dejalas asi como estan en total y deja
// para poder editarlas si necesitan colocar el iva que lo coloquen manual".
//
// El formulario recalculaba el monto desde BI + IVA, asi que al agregarle el
// IVA a una cuenta de Valery se le cambiaba el total. Esa cifra es la que
// mando Angy: es la unica que no se toca.
describe("editar una cuenta no le cambia el total", () => {
  const src = fs.readFileSync("components/finanzas/EditarCuenta.tsx", "utf8");

  test("el monto sale del campo, no de la suma del desglose", () => {
    assert.match(src, /const monto = parseMonto\(montoManual\)/);
    assert.doesNotMatch(src, /const monto = totalCalc \?\?/);
  });

  test("el campo del monto se ve siempre, haya desglose o no", () => {
    // Antes se escondia cuando habia BI e IVA, y entonces el total cambiaba
    // sin que nadie lo viera.
    assert.doesNotMatch(src, /totalCalc === null && \(\s*<CampoMonto etiqueta="Monto/);
    assert.match(src, /<CampoMonto etiqueta="Monto total \*"/);
  });

  test("si el desglose no cuadra con el total, avisa en vez de corregirlo", () => {
    assert.match(src, /No suma el monto total/);
    assert.match(src, /const descuadre =/);
  });
});

// La misma regla que usa la migracion 21. Vive en el codigo para que la
// pantalla pueda mostrar la clase antes de que exista la columna.
describe("claseDeDocumento", () => {
  test("NDE es nota de débito, NE es nota de entrega", () => {
    // Es la distincion que Greeg confirmo. Si se confunden, las 11 cuentas
    // NDE ya cargadas quedan clasificadas mal.
    assert.equal(claseDeDocumento("NDE-46992"), "nota_debito");
    assert.equal(claseDeDocumento("NE-0000017809·AVANTI"), "nota_entrega");
  });

  test("FCM es factura, y lo desconocido también", () => {
    assert.equal(claseDeDocumento("FCM-2192"), "factura");
    // Una cuenta escrita a mano sin prefijo es una factura: es lo mas comun,
    // y de todas formas se puede corregir al editarla.
    assert.equal(claseDeDocumento("12345"), "factura");
  });

  test("no se confunde con un nombre que empiece igual", () => {
    // "NEGOCIO-1" empieza por NE pero no es una nota de entrega.
    assert.equal(claseDeDocumento("NEGOCIO-1"), "factura");
  });

  test("ignora mayúsculas y espacios", () => {
    assert.equal(claseDeDocumento("  nde-500 "), "nota_debito");
  });
});

// Cobrar y pagar usan las MISMAS funciones, pero la retencion cambia de dueño:
// en una cuenta por pagar la retienes tu; en una por cobrar la retiene el
// cliente y se la entera el al SENIAT. Si el rotulo no lo dice, quien mira la
// pantalla entiende al reves quien le debe ese IVA al fisco.
describe("las dos pantallas comparten el motor", () => {
  const detalle = fs.readFileSync("components/finanzas/DetalleCuenta.tsx", "utf8");
  const editar = fs.readFileSync("components/finanzas/EditarCuenta.tsx", "utf8");

  test("el rótulo del neto cambia según el tipo", () => {
    for (const src of [detalle, editar]) {
      assert.match(src, /A cobrar al cliente/);
      assert.match(src, /A pagar al proveedor/);
    }
  });

  test("dice quién retiene cuando la cuenta es por cobrar", () => {
    for (const src of [detalle, editar]) {
      assert.match(src, /IVA que retiene el cliente/);
    }
  });

  test("las dos pantallas abren el mismo detalle y la misma edición", () => {
    for (const f of ["app/admin/payables/page.tsx", "app/admin/receivables/page.tsx"]) {
      const src = fs.readFileSync(f, "utf8");
      assert.match(src, /<DetalleCuenta/, `${f} no abre el detalle`);
      assert.match(src, /<EditarCuenta/, `${f} no permite editar`);
      assert.match(src, /setAbierta\(c\.id\)/, `${f} no abre la fila`);
    }
  });
});

test("un saldo anterior sin documento es un ajuste, no una factura", () => {
  // Son las filas que cargue para TAGUICHO y CONTRACTOR 2000: el estado de
  // cuenta declara un saldo de arranque sin papel detras. Llamarlo factura
  // seria inventar un documento que no existe.
  assert.equal(claseDeDocumento("AJUSTE-SALDO-ANTERIOR·TAGUICHO"), "ajuste");
});

// Greeg todavia no puede correr la migracion 21. La app tiene que funcionar
// igual y DECIR que no pudo hacer, en vez de fallar con un mensaje de Postgres.
describe("la app funciona sin la migración", () => {
  const src = fs.readFileSync("lib/finanzas/cuentas-db.ts", "utf8");

  test("reconoce las DOS formas de decir que falta una columna", () => {
    // Al leer contesta Postgres (42703); al escribir contesta PostgREST antes
    // de llegar a Postgres (PGRST204), porque valida contra su cache. Mirar
    // solo 42703 dejaba pasar el caso de escritura, que es el que hay que
    // degradar. Se vio probando contra la base real, no leyendo la doc.
    assert.match(src, /"42703"/);
    assert.match(src, /"PGRST204"/);
  });

  test("editar guarda lo que puede y avisa lo que no", () => {
    assert.match(src, /aviso: `Se guardó todo menos la clase y la retención/);
  });

  test("ninguna función sube un archivo que despues no va a poder enlazar", () => {
    // Si se sube y despues falla el insert, el archivo queda en el bucket sin
    // nada que lo relacione con una cuenta. Se mira DENTRO de cada funcion:
    // comparar posiciones en todo el archivo daba un falso negativo en cuanto
    // aparecio un segundo upload.
    const cuerpo = (nombre: string) => {
      const i = src.indexOf(`export async function ${nombre}`);
      assert.ok(i > 0, `no existe ${nombre}`);
      const j = src.indexOf("\nexport ", i + 10);
      return src.slice(i, j > 0 ? j : undefined);
    };

    const abono = cuerpo("abonarConComprobante");
    assert.ok(
      abono.indexOf("faltaColumna(sinCol)") < abono.indexOf(".upload("),
      "el abono sube antes de comprobar",
    );

    const alta = cuerpo("crearCuenta");
    assert.ok(
      alta.indexOf("if (sinMigrar)") < alta.indexOf(".upload("),
      "el alta sube antes de comprobar",
    );
  });
});

// Greeg: "tiene que haber una solo facturas en cuentas por cobrar y cuentas
// por pagar". Yo escondia las clases sin registros para no ofrecer un filtro
// que deja la tabla vacia. Pero que no haya facturas es un DATO -no estas
// facturando- y esconder la pestaña lo oculta.
describe("el filtro por clase", () => {
  const src = fs.readFileSync("components/finanzas/FiltroClase.tsx", "utf8");

  test("factura y nota de entrega se muestran siempre, tengan o no registros", () => {
    assert.match(src, /const FIJAS: ClaseCuenta\[\] = \["factura", "nota_entrega"\]/);
    assert.match(src, /FIJAS\.includes\(c\.id\) \|\| conteo\[c\.id\]/);
  });

  test("vive en un solo sitio: las dos pantallas usan el mismo", () => {
    // Tres veces ya se nos separaron dos copias de la misma decision.
    for (const f of ["app/admin/payables/page.tsx", "app/admin/receivables/page.tsx"]) {
      assert.match(fs.readFileSync(f, "utf8"), /<FiltroClase/, `${f} no usa el filtro compartido`);
    }
  });

  test("con un filtro puesto, la tabla vacía no dice que no hay cuentas", () => {
    // Hay 328; lo que no hay es de esa clase. Decir "no hay deudas cargadas"
    // seria mentir sobre el estado del negocio.
    for (const f of ["app/admin/payables/page.tsx", "app/admin/receivables/page.tsx"]) {
      const s = fs.readFileSync(f, "utf8");
      assert.match(s, /filtroClase === "todas"\s*\?/, `${f} no distingue el vacío por filtro`);
      assert.match(s, /No hay ninguna cuenta de esa clase/, `${f} no lo explica`);
    }
  });
});

// Greeg: "en cuenta por pagar las notas de entrega y nota de debito tienen que
// estar en el apartado Nota de Entrega".
describe("grupoDeClase", () => {
  test("las notas comparten pestaña", () => {
    assert.equal(grupoDeClase("nota_debito"), "nota_entrega");
    assert.equal(grupoDeClase("nota_credito"), "nota_entrega");
    assert.equal(grupoDeClase("nota_entrega"), "nota_entrega");
  });

  test("la factura no se agrupa con nada", () => {
    // Es la distincion que importa: la factura es el documento fiscal.
    assert.equal(grupoDeClase("factura"), "factura");
  });

  test("el ajuste tampoco: no es una nota, es un saldo sin papel", () => {
    assert.equal(grupoDeClase("ajuste"), "ajuste");
  });

  test("agrupa la pestaña, no reclasifica la cuenta", () => {
    // Cambiar la clase perderia el dato de que esas once son notas de debito.
    const src = fs.readFileSync("lib/finanzas/retencion.ts", "utf8");
    assert.match(src, /Agrupa la PESTAÑA, no reclasifica/);
  });
});

// Greeg: "el calculo de el iva en cuentas por pagar hazlo automatico al cargar
// el monto coloca el 16% de Iva y deja un check para incluirlo o no".
describe("desglosar un monto", () => {
  test("el monto escrito es el TOTAL, y de ahi sale la base", () => {
    // 116 con IVA son 100 + 16, no 116 + 18,56. El total es el dato duro:
    // es la cifra que dice el papel y la que se debe.
    const d = desglosar(116, true, false);
    assert.equal(d.base, 100);
    assert.equal(d.iva, 16);
    assert.equal(d.total, 116);
  });

  test("base + IVA siempre da el total exacto, al centimo", () => {
    // Calcular el IVA como base * 0,16 y redondear cada uno por separado
    // daba un centimo de diferencia en montos como estos.
    for (const t of [0.99, 1, 33.33, 195, 840.3, 1652, 15657.8, 224575]) {
      const d = desglosar(t, true, false);
      assert.equal(d.base + d.iva, d.total, `${t} no cuadra`);
    }
  });

  test("sin IVA la base es el total: una compra exenta no lo tiene", () => {
    const d = desglosar(500, false, true);
    assert.deepEqual(d, { base: 500, iva: 0, total: 500, retencion: 0 });
  });

  test("la retención sale del IVA calculado, no del total", () => {
    const d = desglosar(116, true, true);
    assert.equal(d.retencion, 12);      // 75% de 16
  });

  test("sin IVA no hay retención aunque se pida", () => {
    assert.equal(desglosar(500, false, true).retencion, 0);
  });

  test("un monto en cero no revienta ni inventa impuestos", () => {
    assert.deepEqual(desglosar(0, true, true), { base: 0, iva: 0, total: 0, retencion: 0 });
  });
});

// Greeg: "el monto que debe mostrarse en el panel debe ser el A pagar al
// proveedor". La retencion no se le paga al proveedor sino al SENIAT, asi que
// la deuda CON EL es el neto.
describe("el panel muestra lo que hay que pagar, no el valor de cara", () => {
  const db = fs.readFileSync("lib/finanzas/cuentas-db.ts", "utf8");
  const pant = fs.readFileSync("app/admin/payables/page.tsx", "utf8");

  test("la pantalla suma en neto, no en bruto", () => {
    assert.match(pant, /const total = conSaldo\.reduce\(\(a, c\) => a \+ c\.saldoNeto, 0\)/);
    assert.doesNotMatch(pant, /reduce\(\(a, c\) => a \+ c\.saldo,/);
  });

  test("la columna se llama «A pagar», no «Monto»", () => {
    // Si el numero es el neto, llamarlo Monto hace creer que es el de la
    // factura, y no cuadraria con el papel.
    assert.match(pant, />A pagar</);
  });

  test("cuando hay retención, el total de la factura sigue a la vista", () => {
    // Sin el, no se puede conciliar la pantalla con el documento.
    assert.match(pant, /factura \{fmtUsd\(c\.monto\)\}/);
  });

  test("abonar, liquidar y el detalle validan contra el MISMO saldo", () => {
    // Si la pantalla mostrara el neto y la base validara contra el bruto, una
    // cuenta pagada por completo nunca terminaria de cerrarse.
    const usos = db.match(/saldoNetoDe\(sb, /g) ?? [];
    assert.ok(usos.length >= 3, `solo ${usos.length} funciones usan el saldo neto`);
    assert.doesNotMatch(db, /from\("cuentas_saldo"\)\.select\("saldo"\)/);
  });
});

/**
 * Filas reales de la "Relacion de Cuentas por Pagar a Proveedores" de
 * Sumigases al 26-08-2026. Si el desglose que calcula el sistema deja de
 * reproducir el de la hoja, la conciliacion con el proveedor se rompe.
 */
describe("el desglose reproduce la relación de cuentas por pagar", () => {
  // Las 32 facturas 100% gravadas de las dos relaciones se reproducen exacto.
  // Las 11 de FEBECA y LA FUENTE llevan renglones exentos y no (ver mas abajo).
  const filas = [
    { prov: "FERREX", doc: "206557", total: 416.56, bi: 359.1, iva: 57.46, ret: 43.1 },
    { prov: "CODINTER", doc: "16200", total: 3881.36, bi: 3346, iva: 535.36, ret: 401.52 },
    { prov: "STAR GAS", doc: "80036", total: 5349.92, bi: 4612, iva: 737.92, ret: 553.44 },
    { prov: "STAR GAS", doc: "79739", total: 6.39, bi: 5.51, iva: 0.88, ret: 0.66 },
  ];

  for (const f of filas) {
    test(`${f.prov} ${f.doc}: de $${f.total} salen BI $${f.bi} e IVA $${f.iva}`, () => {
      const d = desglosar(f.total, true, true);
      assert.equal(d.base, f.bi);
      assert.equal(d.iva, f.iva);
      assert.equal(d.retencion, f.ret);
      // La hoja cuadra columna a columna: BI + IVA tiene que dar el total.
      assert.equal(Math.round((d.base + d.iva) * 100) / 100, f.total);
    });
  }

  test("lo que se le paga al proveedor es el total menos la retención", () => {
    // CODINTER: factura $3.881,36, se le retienen $401,52 y ya se le abonaron
    // $1.550. Le quedan debiendo $1.929,84, que es lo que declara la hoja.
    const d = desglosar(3881.36, true, true);
    const aPagar = Math.round((d.total - d.retencion) * 100) / 100;
    assert.equal(aPagar, 3479.84);
    assert.equal(Math.round((aPagar - 1550) * 100) / 100, 1929.84);
  });

  test("una factura con renglones exentos no la reproduce el 16% automático", () => {
    // FEBECA y LA FUENTE venden alimentos: parte de la factura va exenta, asi
    // que el IVA no es el 16% del total sino de la porcion gravada. El calculo
    // automatico sirve para la mayoria, pero estas hay que cargarlas a mano.
    const d = desglosar(758.65, true, true);
    assert.notEqual(d.base, 656.11); // lo que dice la relacion
    assert.equal(d.base, 654.01); // lo que da suponer todo gravado
    // La diferencia es chica, pero cae directo sobre el IVA y la retencion.
    assert.notEqual(d.retencion, 76.91);
  });

  test("una nota de entrega sin retención se paga completa", () => {
    // OXIORIENTE NDE-0000-0965: la hoja de notas no trae BI ni IVA.
    const d = desglosar(616, false, false);
    assert.equal(d.total, 616);
    assert.equal(d.iva, 0);
    assert.equal(d.retencion, 0);
  });
});

describe("marcar las cuentas cuyo desglose no es el 16% plano", () => {
  test("una factura íntegramente gravada no se marca", () => {
    // FERREX 206557, tal como esta cargada.
    assert.deepEqual(revisarDesglose(416.56, 359.1, 57.46), { atipico: false });
  });

  test("un céntimo de redondeo no alcanza para marcar", () => {
    // Las relaciones traen base e IVA con cuatro decimales. FERRENUESTRO
    // 37375: 943,44 + 150,95 da 1094,39 contra un total de 1094,40.
    assert.deepEqual(revisarDesglose(1094.4, 943.44, 150.95), { atipico: false });
  });

  test("se marca la factura con renglones exentos", () => {
    // FEBECA 7056721: $40,05 del total no llevan IVA.
    const r = revisarDesglose(1996.05, 1686.21, 269.79);
    assert.equal(r.atipico, true);
    assert.equal(r.atipico && r.motivo, "exento");
    assert.equal(r.atipico && r.motivo === "exento" && r.exento, 40.05);
  });

  test("se marca cuando lo exento viene sumado dentro de la base", () => {
    // La hoja de agosto no trae columna de exento, asi que en LA FUENTE
    // 90407344 lo exento quedo dentro de la base y lo que delata es la tasa:
    // $73,56 de IVA sobre una base de $547,69 no es el 16%.
    const r = revisarDesglose(621.25, 547.69, 73.56);
    assert.equal(r.atipico, true);
    assert.equal(r.atipico && r.motivo, "tasa");
    assert.ok(r.atipico && r.motivo === "tasa" && r.tasa < 0.16);
  });

  test("una nota de entrega sin desglose no se marca", () => {
    // No tener base no es una anomalia: las notas no la traen.
    assert.deepEqual(revisarDesglose(616, null, null), { atipico: false });
  });

  test("la parte exenta es la que falta para llegar al total", () => {
    assert.equal(parteExenta(1996.05, 1686.21, 269.79), 40.05);
    assert.equal(parteExenta(416.56, 359.1, 57.46), 0);
    assert.equal(parteExenta(616, null, null), 0);
  });
});

describe("la marca llega hasta la pantalla", () => {
  const pagar = fs.readFileSync("app/admin/payables/page.tsx", "utf8");
  const marca = fs.readFileSync("components/finanzas/MarcaRevision.tsx", "utf8");
  const db = fs.readFileSync("lib/finanzas/cuentas-db.ts", "utf8");

  test("el panel monta la marca, no solo la importa", () => {
    // Una prueba que solo buscara el import pasaria con el componente muerto.
    assert.match(pagar, /<MarcaRevision revision=\{c\.revision\}/);
  });

  test("además de la marca por fila hay un aviso arriba", () => {
    // Greeg pidio que se le NOTIFIQUE. Una marca chica en una fila entre
    // sesenta no notifica a nadie: hay que verla al entrar.
    assert.match(pagar, /const aRevisar = conSaldo\.filter\(\(c\) => c\.revision\.atipico\)/);
    assert.match(pagar, /tone="warn"/);
  });

  test("la marca dice qué hacer, no solo que algo pasa", () => {
    // Sin el «cargá la base y el IVA a mano», la marca no evita el error.
    assert.match(marca, /a mano/);
  });

  test("listarCuentas trae la base y el IVA que la vista no expone", () => {
    // Sin ellos no hay con que revisar el desglose y nada se marcaria nunca.
    assert.match(db, /consulta\("id, base_imponible, iva, iva_retenido[^"]*"\)/);
    assert.match(db, /revision: revisarDesglose\(/);
  });
});

describe("la lista de cuentas lee la clase y el estado de la migración 21", () => {
  const db = fs.readFileSync("lib/finanzas/cuentas-db.ts", "utf8");

  test("pide clase y estado a la tabla, y si no existen sigue sin ellas", () => {
    // Antes la lista mostraba TODA cuenta como abierta: una liquidada seguia
    // apareciendo en el total a pagar despues de correr la 21.
    assert.match(db, /consulta\("id, base_imponible, iva, iva_retenido, clase, estado"\)/);
    assert.match(db, /if \(faltaColumna\(r\.error\)\) r = await consulta\("id, base_imponible, iva, iva_retenido"\)/);
  });

  test("usa el estado guardado antes que el de por defecto", () => {
    assert.match(db, /estado: d\?\.estado \?\? \("abierta" as EstadoCuenta\)/);
    assert.match(db, /clase: d\?\.clase \?\? claseDeDocumento\(c\.documento\)/);
    assert.doesNotMatch(db, /^\s+estado: "abierta" as EstadoCuenta,$/m);
  });
});
