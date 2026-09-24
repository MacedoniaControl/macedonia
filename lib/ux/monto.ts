// Leer un monto escrito por una persona en Venezuela.
//
// El campo era <input type="number">. Ese control solo acepta el formato del
// LOCALE DEL NAVEGADOR, y cuando no lo entiende devuelve cadena vacia sin
// avisar. Escribiendo como se escribe aquí:
//
//   "1500,50"    -> value "" -> 0        (se pierde)
//   "1.500,50"   -> value "" -> 0        (se pierde)
//   "1.500"      -> value "1.500" -> 1.5 (queda MAL y parece bien)
//
// El tercero es el grave: mil quinientos se guarda como uno con cincuenta, sin
// error, sin aviso, y con cara de numero correcto.

/** Separador decimal: el ultimo que aparezca. "1.500,50" -> coma. */
function separadorDecimal(s: string): "," | "." | null {
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma < 0 && punto < 0) return null;
  return coma > punto ? "," : ".";
}

/**
 * Convierte lo escrito en un numero. `null` si no se entiende, para poder
 * DECIRLO en vez de guardar un cero disfrazado de dato.
 *
 * Acepta las dos convenciones porque las dos se usan: "1.500,50" (Venezuela) y
 * "1,500.50" (planillas en ingles). La regla es el ultimo separador manda.
 *
 * Un punto seguido de EXACTAMENTE tres digitos y nada mas se lee como millar:
 * "1.500" es mil quinientos. Nadie escribe "1.500" para decir uno con medio,
 * pero todo el mundo lo escribe para decir mil quinientos.
 */
export function parseMonto(entrada: string): number | null {
  const s = entrada.trim().replace(/\s|\u00a0/g, "");
  if (!s) return null;
  if (!/^-?[\d.,]+$/.test(s)) return null;
  // Dos separadores pegados es un error de tecleo, no un numero. Limpiarlos
  // convertiria "1..2,3" en 12,3: una entrada rota disfrazada de dato bueno.
  if (/[.,]{2,}/.test(s)) return null;

  const negativo = s.startsWith("-");
  const cuerpo = negativo ? s.slice(1) : s;
  const dec = separadorDecimal(cuerpo);

  // Un punto con exactamente tres digitos detras y ninguna coma en juego es un
  // millar: "1.500" es mil quinientos, no uno con medio.
  const puntoEsMillar =
    dec === "." &&
    !cuerpo.includes(",") &&
    cuerpo.length - cuerpo.lastIndexOf(".") - 1 === 3;

  const decSep = puntoEsMillar ? null : dec;

  let entero: string;
  let decimales = "";
  if (decSep === null) {
    entero = cuerpo;
  } else {
    const corte = cuerpo.lastIndexOf(decSep);
    entero = cuerpo.slice(0, corte);
    decimales = cuerpo.slice(corte + 1);
  }

  if (!/^\d*$/.test(decimales)) return null;

  // Lo que quede delante solo puede ser digitos, o grupos de tres separados de
  // forma pareja. "1,2,3" no es un numero: son tres cosas.
  // El separador de millar es el que NO quedo como decimal. Cuando no hay
  // decimal, el que aparezca: "1.500" y "1,500" son los dos mil quinientos.
  const millar: "," | "." =
    decSep === "," ? "." : decSep === "." ? "," : cuerpo.includes(".") ? "." : ",";
  const sinMillar = entero.split(millar).join("");
  if (entero.includes(millar)) {
    const grupos = entero.split(millar);
    const bien = grupos.length > 1
      && /^\d{1,3}$/.test(grupos[0])
      && grupos.slice(1).every((g) => /^\d{3}$/.test(g));
    if (!bien) return null;
  }
  if (entero !== "" && !/^\d+$/.test(sinMillar)) return null;
  if (entero === "" && decimales === "") return null;

  const n = Number(`${sinMillar || "0"}.${decimales || "0"}`);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}
/** Como se muestra de vuelta, para que quien escribio pueda comprobarlo. */
export function fmtMonto(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
