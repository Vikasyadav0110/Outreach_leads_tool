"use client";

import { useEffect, useState } from "react";

// Lightweight toast system with no React context: any client component can
// `import { toast }` and fire one; a single <Toaster/> (mounted in layout)
// subscribes and renders them. Toasts auto-dismiss.
let listeners = [];
let seq = 0;

export function toast(message, type = "success") {
  const t = { id: ++seq, message, type };
  listeners.forEach((fn) => fn(t));
}

const TONE = {
  success: "bg-success",
  error: "bg-danger",
  info: "bg-ink",
};

function ToastIcon({ type }) {
  if (type === "error") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const add = (t) => {
      setItems((cur) => [...cur, t]);
      setTimeout(() => {
        setItems((cur) => cur.filter((x) => x.id !== t.id));
      }, 3000);
    };
    listeners.push(add);
    return () => {
      listeners = listeners.filter((fn) => fn !== add);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`animate-fadeInUp pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-pop ${
            TONE[t.type] || TONE.info
          }`}
        >
          <ToastIcon type={t.type} />
          {t.message}
        </div>
      ))}
    </div>
  );
}
