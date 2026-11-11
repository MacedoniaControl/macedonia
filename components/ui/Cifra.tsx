import { Fragment } from "react";

// Un monto que puede partirse en dos renglones en una tarjeta angosta. Con 3
// decimales «$112.151,350» no cabe a veces y el navegador lo cortaba donde
// fuera («$112.151,3» / «50»): se lee otro número. Aquí solo puede partirse
// después de un punto de miles o antes de «Bs», nunca dentro de los decimales.
export function Cifra({ texto }: { texto: string }) {
  // Sin «(?<=…)»: Safari no lo entendía antes de iOS 16.4 y el código no cargaba.
  const partes = texto.replace(/\./g, ".\u0000").replace(/ Bs/g, "\u0000 Bs").split("\u0000");
  return <>{partes.map((p, i) => <Fragment key={i}>{i > 0 && <wbr />}{p}</Fragment>)}</>;
}
