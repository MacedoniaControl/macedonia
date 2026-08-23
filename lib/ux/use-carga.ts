"use client";

// Carga asíncrona de datos, sin setState síncrono dentro del efecto.
//
// El patrón ingenuo es:
//     useEffect(() => { setCargando(true); traer().then(setDatos); }, [clave])
// y ese `setCargando(true)` dispara un render extra antes de que la petición
// siquiera salga. React lo marca como error porque encadena renders.
//
// Aquí "cargando" no se guarda: se DEDUCE de si lo que hay en memoria pertenece
// a la clave que se está pidiendo ahora. Un dato que llega tarde de otra empresa
// tampoco puede pisar al actual.

import { useEffect, useState } from "react";

export type Carga<T> = {
  datos: T | null;
  error: string | null;
  cargando: boolean;
  recargar: () => void;
};

export function useCarga<T>(clave: string, traer: () => Promise<T>): Carga<T> {
  const [estado, setEstado] = useState<{ clave: string; datos: T | null; error: string | null } | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    traer()
      .then((d) => { if (vigente) setEstado({ clave, datos: d, error: null }); })
      .catch((e) => { if (vigente) setEstado({ clave, datos: null, error: (e as Error).message }); });
    return () => { vigente = false; };
    // `traer` cambia de identidad en cada render; la clave es lo que define
    // cuándo hay que volver a pedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, intento]);

  return {
    datos: estado?.clave === clave ? estado.datos : null,
    error: estado?.clave === clave ? estado.error : null,
    cargando: estado?.clave !== clave,
    recargar: () => setIntento((n) => n + 1),
  };
}
