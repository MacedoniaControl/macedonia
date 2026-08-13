"use client";

/**
 * Pitido de confirmación de lectura: agudo = encontrado, grave = no encontrado.
 * El operador suele estar mirando la mercancía, no la pantalla.
 */
export function beep(ok: boolean) {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = ok ? 880 : 200;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.07 : 0.22));
    setTimeout(() => void ctx.close(), 500);
  } catch {
    /* sin audio disponible: el feedback visual basta */
  }
}
