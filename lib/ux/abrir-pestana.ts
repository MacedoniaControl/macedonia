// Abrir un documento (PDF, foto de un comprobante) en una pestaña nueva cuando
// su enlace hay que pedirlo primero al servidor.
//
// Safari en iPhone y iPad bloquea `window.open` si no ocurre en el mismo
// instante del toque: después de un `await` ya no cuenta como acción del
// usuario y la ventana no se abre, sin avisar. Por eso la pestaña se abre
// vacía al tocar, y cuando llega el enlace se lleva ahí. Si aun así no se
// pudo abrir, se abre en la misma pestaña: nunca «no pasa nada».

export async function abrirEnPestana(pedirUrl: () => Promise<string | null>): Promise<boolean> {
  const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
  // Sin acceso a esta página desde la nueva (lo que hacía «noopener»).
  if (w) w.opener = null;
  let url: string | null = null;
  try {
    url = await pedirUrl();
  } catch {
    url = null;
  }
  if (!url) {
    w?.close();
    return false;
  }
  if (w) w.location.href = url;
  else window.location.href = url;
  return true;
}
