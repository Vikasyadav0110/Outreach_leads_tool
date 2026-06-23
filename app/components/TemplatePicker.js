"use client";

import { useEffect, useRef, useState } from "react";
import { DocIcon } from "./icons";
import { fillTemplate } from "./templateVars";

// Small dropdown that loads saved snippets and inserts one via onInsert(body).
// Opens upward (for bottom-anchored inputs like the copilot).
// Optional: `channel` filters to that channel + "general"; `vars` token-fills the
// body (via fillTemplate) before insert. Label/up are presentation tweaks.
export default function TemplatePicker({ onInsert, up = true, channel = null, vars = null, label = "Templates" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/snippets")
      .then((r) => r.json())
      .then((d) => setItems(d.snippets || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // When a channel is given, show that channel's templates + the catch-all "general".
  const visible = channel ? items.filter((s) => s.channel === channel || s.channel === "general") : items;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost px-2.5 py-1 text-xs"
        title="Insert a saved template"
      >
        <DocIcon width="13" height="13" />
        {label}
      </button>
      {open && (
        <div className={`absolute left-0 z-10 max-h-64 w-72 overflow-y-auto rounded-card border border-line bg-card shadow-pop ${up ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {!loaded && <div className="px-3 py-3 text-xs text-muted">Loading…</div>}
          {loaded && visible.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted">
              No {channel ? `${channel} ` : ""}templates yet — create some in Templates.
            </div>
          )}
          {visible.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onInsert(vars ? fillTemplate(s.body, vars) : s.body);
                // Fire-and-forget usage bump.
                fetch(`/api/snippets/${s.id}`, { method: "PATCH" }).catch(() => {});
                setOpen(false);
              }}
              className="block w-full border-b border-line px-3 py-2 text-left last:border-0 hover:bg-[#f3f3f0]"
            >
              <div className="truncate text-xs font-medium text-ink">{s.title || "Untitled"}</div>
              <div className="truncate text-[11px] text-muted">{s.body}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
