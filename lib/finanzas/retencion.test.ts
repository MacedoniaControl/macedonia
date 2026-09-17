import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { retencionDe, PCT_RETENCION, CLASES, claseDeDocumento, grupoDeClase } from "./retencion.ts";

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

  test("el comprobante se rechaza ANTES de subirlo", () => {
    // Si se sube y despues falla el insert, el archivo queda en el bucket sin
    // nada que lo relacione con una cuenta.
    const i = src.indexOf("faltaColumna(sinCol)");
    const j = src.indexOf(".upload(");
    assert.ok(i > 0 && j > 0 && i < j, "la comprobación tiene que ir antes del upload");
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
