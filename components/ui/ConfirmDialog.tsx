"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Diálogo de confirmación para acciones destructivas. Render-prop: expone `confirm` para
 * disparar la apertura. No ejecuta lógica de negocio; solo confirma intención.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  trigger,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-base font-semibold text-text">{title}</h2>
            <p className="mt-2 text-sm text-muted">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {cancelLabel}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  onConfirm?.();
                  setOpen(false);
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
