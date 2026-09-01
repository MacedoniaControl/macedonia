"use client";

// Píldora «Subir Archivo» con zona de arrastre.
//
// Antes esto era una pestaña más, al mismo nivel que generar un documento. Pero
// subir un PDF viejo de Valery no es una tarea diaria: es algo que se hace de a
// ratos. Ocupaba un lugar de primera fila que le corresponde al trabajo real.

import { useRef, useState } from "react";
import { PildoraPanel } from "@/components/ui/PildoraPanel";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export function SubirArchivo({
  onArchivos,
  acepta = ".pdf",
  ayuda,
  etiqueta = "Subir Archivo",
}: {
  onArchivos: (f: FileList | null) => void;
  acepta?: string;
  ayuda?: string;
  etiqueta?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  return (
    <PildoraPanel etiqueta={etiqueta} icono="upload" ancho="w-[24rem]">
      {(cerrar) => (
        <div>
          <input ref={ref} type="file" accept={acepta} multiple className="hidden"
            onChange={(e) => { onArchivos(e.target.files); cerrar(); }} />

          <div
            onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
            onDragLeave={() => setEncima(false)}
            onDrop={(e) => {
              e.preventDefault();
              setEncima(false);
              onArchivos(e.dataTransfer.files);
              cerrar();
            }}
            className={`flex flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center transition
              ${encima ? "border-brand bg-brand-soft" : "border-border bg-surface-2"}`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Icon name="upload" size={22} />
            </span>
            <p className="mt-3 text-sm font-medium text-text">Arrastrá los archivos acá</p>
            {ayuda && <p className="mt-1 text-xs text-muted">{ayuda}</p>}
            <Button icon="upload" onClick={() => ref.current?.click()} className="mt-4">
              Seleccionar archivos
            </Button>
          </div>
        </div>
      )}
    </PildoraPanel>
  );
}
