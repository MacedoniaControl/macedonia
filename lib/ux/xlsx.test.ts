import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { leerXlsx, hojasDe, pareceXlsx, aTexto } from "./xlsx.ts";

// Libro real, armado a mano y guardado en base64 para que la prueba no dependa
// de archivos de afuera. Dos hojas: una de portada y una con la cartera.
// La fila 2 no tiene celda B a propósito: prueba el relleno de huecos.
const LIBRO_B64 =
  "UEsDBBQAAAAIAHmpH13muHRrXAAAAGIAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbBXMTQqAIBBA4auE+xxr0SJKL9EFRKYfylGcIer22fLxwZvcE6/mxsJHoll12ihnp+XNyE0V4lntInkE4LBj9KxTRqqyphK91CwbZB9OvyH0xgwQEgmStPI/FNgPUEsDBBQAAAAIAHmpH128Ik/jYwAAAJkAAAAPAAAAeGwvd29ya2Jvb2sueG1ss7GvyM1RKEstKs7Mz7NVMtQzULK3synPL8pOys/PtrMpzkhNLSmG0gp5ibmptkoB+UUliSmJSgpgQc8UoDYlhSKrTCCjyDPFUEkfVblzYlFJahGyciMk5UYg5fowa/ThNgMAUEsDBBQAAAAIAHmpH11JqWYQfwAAAMEAAAAUAAAAeGwvc2hhcmVkU3RyaW5ncy54bWyzsa/IzVEoSy0qzszPs1Uy1DNQsrezKS4uUUjOL80rsVUyVVIozcssLE11hvGB0pl2NiV2AUX5ZampKflFNvoldjb6IEGIhEt+cmlual5JPrqEbz4WweAQxyAFd8dgBWcdR3Q5x2S1xNwC69xUBbWcEutgR7X0EmuEGn2gM+0AUEsDBBQAAAAIAHmpH13dH7D6bQAAAI4AAAAYAAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sTY1BCsNACEWvMniATrM3hkLX3fQEQxAiSR1QaXr8mmzahf7P9/PE6fPaypvNpesIw+UKE+HebfWFOQhPubdohNb3YtkBwvkwtwFKjCC6ifIzLHNxwqBHj+ZFNNi0OdbE1ONS55yk5P7D1t+3L1BLAwQUAAAACAB5qR9d/yWojagAAABvAQAAGAAAAHhsL3dvcmtzaGVldHMvc2hlZXQyLnhtbG2QXQ6DIBCEr2J4rygY2ybrmv6kF+gJjCEpqWICRHv8rrZBasoDsHyTmWWhfvVdMirr9GAqlqcZqxGmwT7dQymPsBzXxjcIdpgSSxqG0M6XU84SXzFH9YgZ8BGBt192jln+yy4xE4Fx8g8hIoSISCw3RmJ5LfbHMqUtrPK/pwyeMvIsNo1/mDadNuruLWm0Q/B429E3aCB8LtcW5GJyKDaRPJobX8f5BlBLAQIUAxQAAAAIAHmpH13muHRrXAAAAGIAAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAeakfXbwiT+NjAAAAmQAAAA8AAAAAAAAAAAAAAIABjQAAAHhsL3dvcmtib29rLnhtbFBLAQIUAxQAAAAIAHmpH11JqWYQfwAAAMEAAAAUAAAAAAAAAAAAAACAAR0BAAB4bC9zaGFyZWRTdHJpbmdzLnhtbFBLAQIUAxQAAAAIAHmpH13dH7D6bQAAAI4AAAAYAAAAAAAAAAAAAACAAc4BAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwECFAMUAAAACAB5qR9d/yWojagAAABvAQAAGAAAAAAAAAAAAAAAgAFxAgAAeGwvd29ya3NoZWV0cy9zaGVldDIueG1sUEsFBgAAAAAFAAUATAEAAE8DAAAAAA==";

const libro = (): ArrayBuffer => {
  const b = Buffer.from(LIBRO_B64, "base64");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe("pareceXlsx", () => {
  test("un .xlsx empieza con PK", () => {
    assert.equal(pareceXlsx(libro()), true);
  });
  test("un .xls binario NO parece xlsx", () => {
    // Firma del formato viejo (documento compuesto OLE2).
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);
    assert.equal(pareceXlsx(xls.buffer as ArrayBuffer), false);
  });
});

describe("hojasDe", () => {
  test("lee los nombres en orden", async () => {
    assert.deepEqual(await hojasDe(libro()), ["Portada", "Cartera"]);
  });
});

describe("leerXlsx", () => {
  test("lee la hoja que se le pide, no siempre la primera", async () => {
    const portada = await leerXlsx(libro(), 0);
    const cartera = await leerXlsx(libro(), 1);
    assert.equal(portada[0][0], "Notas internas");
    assert.equal(cartera[0][0], "Proveedor");
  });

  test("resuelve los textos compartidos", async () => {
    const f = await leerXlsx(libro(), 1);
    assert.deepEqual(f[0], ["Proveedor", "Documento", "Monto"]);
    assert.equal(f[1][0], "STAR GAS C,A");
  });

  test("rellena las celdas que Excel omite, sin correr las columnas", async () => {
    const f = await leerXlsx(libro(), 1);
    // La fila 2 no trae celda B: el monto tiene que quedar en la posicion 2.
    assert.equal(f[1][1], "");
    assert.equal(f[1][2], "4796.48");
  });

  test("recorta el ruido de punto flotante", async () => {
    const f = await leerXlsx(libro(), 1);
    // En el archivo dice 4796.4799999999996
    assert.equal(f[1][2], "4796.48");
  });

  test("desescapa las entidades XML", async () => {
    const f = await leerXlsx(libro(), 1);
    assert.equal(f[2][0], "Ac&me <SA>");
  });

  test("lee celdas de texto en linea", async () => {
    const f = await leerXlsx(libro(), 1);
    assert.equal(f[2][1], "F-1");
  });

  test("un buffer que no es zip da un error entendible", async () => {
    const basura = new Uint8Array(100).buffer as ArrayBuffer;
    await assert.rejects(() => leerXlsx(basura), /no es un \.xlsx/i);
  });
});

describe("aTexto", () => {
  test("arma texto con tabulaciones para reusar el parser de cartera", () => {
    assert.equal(aTexto([["a", "b"], ["c", "d"]]), "a\tb\nc\td");
  });
  test("los saltos de linea dentro de una celda no parten la fila", () => {
    assert.equal(aTexto([["a\nb", "c"]]), "a b\tc");
  });
});

/** Arma un .xlsx minimo en memoria: un ZIP con las entradas sin comprimir
 *  (metodo 0), que es lo que el lector acepta ademas de deflate. Sirve para
 *  probar formas de hoja que el libro base64 fijo no cubre. */
function libroConHoja(hojaXml: string): ArrayBuffer {
  const nombre = "xl/worksheets/sheet1.xml";
  const cuerpo = new TextEncoder().encode(hojaXml);
  const nom = new TextEncoder().encode(nombre);
  const partes: number[] = [];
  const push = (...b: number[]) => partes.push(...b);
  const u16 = (n: number) => push(n & 255, (n >> 8) & 255);
  const u32 = (n: number) => push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);

  const inicioLocal = 0;
  u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(0);
  u32(0); u32(cuerpo.length); u32(cuerpo.length); u16(nom.length); u16(0);
  push(...nom, ...cuerpo);

  const inicioCentral = partes.length;
  u32(0x02014b50); u16(20); u16(20); u16(0); u16(0); u16(0); u16(0);
  u32(0); u32(cuerpo.length); u32(cuerpo.length);
  u16(nom.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(inicioLocal);
  push(...nom);

  const largoCentral = partes.length - inicioCentral;
  u32(0x06054b50); u16(0); u16(0); u16(1); u16(1);
  u32(largoCentral); u32(inicioCentral); u16(0);

  return new Uint8Array(partes).buffer as ArrayBuffer;
}

test("coloca cada fila en su numero aunque Excel omita las vacias", async () => {
  // Excel no escribe las filas vacias. Apilarlas en orden corre todo hacia
  // arriba y hace que un rotulo se lea como si fuera el valor que tiene
  // debajo: es lo que hizo leer mal el conteo de cilindros de septiembre.
  const filas = await leerXlsx(
    libroConHoja(
      `<worksheet><sheetData>` +
        `<row r="1"><c r="A1" t="inlineStr"><is><t>cabecera</t></is></c></row>` +
        `<row r="5"><c r="A5" t="inlineStr"><is><t>valor</t></is></c></row>` +
        `</sheetData></worksheet>`,
    ),
  );
  assert.equal(filas.length, 5);
  assert.equal(filas[0][0], "cabecera");
  assert.deepEqual(filas[1], []);
  assert.equal(filas[4][0], "valor");
});

test("una celda vacia auto-cerrada no se traga la celda siguiente", async () => {
  // Excel escribe <c r="A6" s="18"/> para una celda con formato y sin valor.
  // Un patron que solo acepta <c ...>...</c> hace que esa celda abra la
  // coincidencia y consuma la siguiente: el valor cae una columna antes y su
  // texto compartido queda sin resolver, apareciendo como el indice crudo.
  const filas = await leerXlsx(
    libroConHoja(
      `<worksheet><sheetData><row r="1">` +
        `<c r="A1" s="18"/>` +
        `<c r="B1" t="inlineStr"><is><t>nitrogeno</t></is></c>` +
        `<c r="C1" s="27"/>` +
        `<c r="D1"><v>71</v></c>` +
        `</row></sheetData></worksheet>`,
    ),
  );
  assert.equal(filas[0][0], "");
  assert.equal(filas[0][1], "nitrogeno");
  assert.equal(filas[0][2], "");
  assert.equal(filas[0][3], "71");
});

test("una fila vacia auto-cerrada no corre la fila siguiente", async () => {
  // <row r="1" ht="30"/> es una fila con alto propio y sin celdas. Si el
  // patron solo acepta <row ...>...</row>, esa fila se traga la siguiente y
  // los encabezados aparecen un renglon mas arriba de donde estan.
  const filas = await leerXlsx(
    libroConHoja(
      `<worksheet><sheetData>` +
        `<row r="1" ht="30" customHeight="1"/>` +
        `<row r="2"><c r="B2" t="inlineStr"><is><t>DESCRIPCION</t></is></c></row>` +
        `</sheetData></worksheet>`,
    ),
  );
  assert.deepEqual(filas[0], []);
  assert.equal(filas[1][1], "DESCRIPCION");
});
