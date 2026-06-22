"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Generic confirm dialog used before AI-generation / destructive actions.
// Render conditionally: {open && <ConfirmActionModal .../>}
export default function ConfirmActionModal({
  title = "Are you sure?",
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary", // primary | danger
  busy = false,
  onConfirm,
  onClose,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-card border border-line bg-canvas p-5 shadow-pop">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {body && <p className="mt-2 text-sm text-muted">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost px-4 py-2 text-sm disabled:opacity-50">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              tone === "danger" ? "btn bg-danger hover:bg-[#b91c1c]" : "btn-primary"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
