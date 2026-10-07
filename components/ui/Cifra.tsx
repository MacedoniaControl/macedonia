import { Fragment } from "react";

// Un monto que puede partirse en dos renglones en una tarjeta angosta. Con 3
// decimales «$112.151,350» no cabe a veces y el navegador lo cortaba donde
// fuera («$112.151,3» / «50»): se lee otro número. Aquí solo puede partirse
// después de un punto de miles o antes de «Bs», nunca dentro de los decimales.
export function Cifra({ texto }: { texto: string }) {
  const partes = texto.split(/(?<=\.)|(?= Bs)/);
  return <>{partes.map((p, i) => <Fragment key={i}>{i > 0 && <wbr />}{p}</Fragment>)}</>;
}
