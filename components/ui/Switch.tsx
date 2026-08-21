"use client";

// Interruptor on/off.
//
// Es un <button role="switch"> real, no un div con onClick: así funciona con
// teclado (Espacio y Enter) y los lectores de pantalla lo anuncian como
// interruptor, diciendo si está encendido o apagado.
//
// El estado se distingue por POSICIÓN del círculo y por color, nunca solo por
// color: alguien con daltonismo lo lee igual.
//
// Área táctil de 44px aunque la píldora se vea de 27: se usa desde el celular.
// El color encendido es el de la marca de la empresa activa (naranja Sumigases,
// azul Sudematin), que lo aplica el tema por la clase de la ruta.

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-11 w-[52px] flex-none items-center justify-center
                 rounded-xl transition focus:outline-none focus-visible:ring-2
                 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden
        className={`h-[27px] w-[46px] rounded-full transition-colors motion-reduce:transition-none ${
          checked ? "bg-brand-strong" : "bg-border-strong"
        }`}
      />
      <span
        aria-hidden
        className={`absolute h-[21px] w-[21px] rounded-full bg-white shadow transition-transform
                    motion-reduce:transition-none ${
                      checked ? "translate-x-[9px]" : "-translate-x-[9px]"
                    }`}
      />
    </button>
  );
}
