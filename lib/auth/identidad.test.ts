// Pruebas de la traducción usuario <-> correo interno.
// Sin dependencias: Node ejecuta TypeScript de forma nativa.
//   npm test
//
// Se prueba esto y no otra cosa porque aquí se decide si alguien entra o no:
// un fallo silencioso acá deja a un técnico fuera del sistema, o peor, hace que
// dos personas distintas resuelvan al mismo correo y compartan cuenta.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  usuarioACorreo,
  correoAUsuario,
  normalizarUsuario,
  usuarioValido,
  errorDeUsuario,
  DOMINIO_INTERNO,
} from "./identidad.ts";

describe("usuarioACorreo", () => {
  test("le agrega el dominio interno a un usuario simple", () => {
    assert.equal(usuarioACorreo("jose"), `jose@${DOMINIO_INTERNO}`);
  });

  test("ignora mayúsculas y espacios sobrantes", () => {
    // El técnico escribe en el celular: el autocorrector pone mayúscula inicial
    // y a veces un espacio al final. No puede quedar fuera por eso.
    assert.equal(usuarioACorreo("  Jose  "), `jose@${DOMINIO_INTERNO}`);
    assert.equal(usuarioACorreo("JOSE"), `jose@${DOMINIO_INTERNO}`);
  });

  test("respeta un correo real si ya lo escribieron completo", () => {
    assert.equal(usuarioACorreo("greeg@protonmail.com"), "greeg@protonmail.com");
  });

  test("dos formas de escribir el mismo usuario dan el MISMO correo", () => {
    // Si no, la misma persona podría crear dos cuentas sin darse cuenta.
    assert.equal(usuarioACorreo("Jose"), usuarioACorreo("jose "));
  });

  test("usuarios distintos NUNCA dan el mismo correo", () => {
    assert.notEqual(usuarioACorreo("jose"), usuarioACorreo("jose1"));
    assert.notEqual(usuarioACorreo("jose.perez"), usuarioACorreo("joseperez"));
  });
});

describe("correoAUsuario", () => {
  test("quita el dominio interno para mostrarlo en pantalla", () => {
    assert.equal(correoAUsuario(`jose@${DOMINIO_INTERNO}`), "jose");
  });

  test("deja intacto un correo real", () => {
    assert.equal(correoAUsuario("greeg@protonmail.com"), "greeg@protonmail.com");
  });

  test("es la vuelta exacta de usuarioACorreo", () => {
    for (const u of ["jose", "maria.g", "tecnico-3", "a_b"]) {
      assert.equal(correoAUsuario(usuarioACorreo(u)), u);
    }
  });
});

describe("validación", () => {
  test("acepta letras, números, punto, guion y guion bajo", () => {
    for (const u of ["jose", "maria.g", "tecnico-3", "a_b", "usuario123"]) {
      assert.ok(usuarioValido(u), `debería aceptar: ${u}`);
    }
  });

  test("rechaza espacios y caracteres raros", () => {
    for (const u of ["jose perez", "josé", "jose!", "jo se"]) {
      assert.ok(!usuarioValido(u), `debería rechazar: ${u}`);
    }
  });

  test("rechaza demasiado corto", () => {
    assert.ok(!usuarioValido("jo"));
    assert.ok(usuarioValido("jos"));
  });

  test("errorDeUsuario devuelve null cuando el usuario sirve", () => {
    assert.equal(errorDeUsuario("jose"), null);
    assert.equal(errorDeUsuario("greeg@protonmail.com"), null);
  });

  test("errorDeUsuario explica el problema, no solo falla", () => {
    // El mensaje lo lee un técnico en un celular: tiene que decirle qué hacer.
    assert.match(errorDeUsuario("") ?? "", /escribe tu usuario/i);
    assert.match(errorDeUsuario("jo") ?? "", /3 caracteres/i);
    assert.match(errorDeUsuario("jose perez") ?? "", /letras|números|guion/i);
  });
});

describe("normalizarUsuario", () => {
  test("no rompe con entrada vacía", () => {
    assert.equal(normalizarUsuario(""), "");
    assert.equal(normalizarUsuario("   "), "");
  });
});
