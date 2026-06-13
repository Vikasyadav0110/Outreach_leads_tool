"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Global ⌘K / Ctrl+K palette: new campaign, jump to a campaign, navigate.
// Also opens on a window "op-open-palette" event (fired by the sidebar button).
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("op-open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("op-open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns || []))
      .catch(() => {});
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function go(href) {
    setOpen(false);
    router.push(href);
  }

  const items = [
    { id: "new", label: "New campaign", hint: "Create", run: () => go("/campaigns/new") },
    { id: "dash", label: "Go to Dashboard", hint: "Nav", run: () => go("/") },
    { id: "settings", label: "Go to Settings", hint: "Nav", run: () => go("/settings") },
    ...campaigns.map((c) => ({
      id: "c" + c.id,
      label: `${c.niche} · ${c.city}`,
      hint: "Campaign",
      run: () => go(`/campaign/${c.id}`),
    })),
  ];
  const filtered = q
    ? items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()))
    : items;

  function onInputKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-card border border-line bg-card shadow-pop">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKey}
          placeholder="Type a command or search campaigns…"
          className="w-full border-b border-line px-4 py-3 text-sm text-ink outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">No matches</li>
          )}
          {filtered.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={it.run}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                  i === active ? "bg-accent/10 text-accent" : "text-ink hover:bg-[#f3f3f0]"
                }`}
              >
                <span>{it.label}</span>
                {it.hint && <span className="text-xs text-muted">{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-2 text-[11px] text-muted">
          ↑↓ navigate · ↵ select · esc close
        </div>
      </div>
    </div>
  );
}
