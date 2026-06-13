"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import CopyButton from "./CopyButton";
import TemplatePicker from "./TemplatePicker";

const QUICK = [
  "Draft a WhatsApp follow-up for a lead who didn't reply",
  "Give me 3 cold-email subject lines for a dental clinic",
  "Make this more formal: ",
];

function SparkleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3Z" />
      <path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </svg>
  );
}

export default function Copilot() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState("");
  const [contextLabel, setContextLabel] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, open]);

  // When opened on a campaign page, load that campaign as context for the copilot.
  useEffect(() => {
    if (!open) return;
    const m = pathname.match(/^\/campaign\/(\d+)/);
    if (!m) {
      setContext("");
      setContextLabel("");
      return;
    }
    fetch(`/api/campaigns/${m[1]}`)
      .then((r) => r.json())
      .then((d) => {
        const c = d.campaign;
        if (!c) return;
        const leads = (c.leads || [])
          .slice(0, 12)
          .map((l) => `${l.name} (score ${l.score}, ${l.gap})`)
          .join("; ");
        setContext(
          `Campaign: ${c.niche} in ${c.city} (${c.domain}). Leads: ${leads || "none yet"}.`
        );
        setContextLabel(`${c.niche} · ${c.city}`);
      })
      .catch(() => {});
  }, [open, pathname]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...msgs, { role: "user", content }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed.");
      setMsgs((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: "⚠️ " + e.message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close AI copilot" : "Open AI copilot"}
        className="fixed bottom-5 right-5 z-[55] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent2 text-white shadow-pop transition hover:brightness-110 active:scale-95"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        ) : (
          <SparkleIcon width="20" height="20" />
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-[56] flex h-[520px] w-[min(92vw,380px)] flex-col overflow-hidden rounded-card border border-line bg-card shadow-pop">
          <div className="flex items-center gap-2 border-b border-line bg-gradient-to-r from-accent/10 to-accent2/10 px-4 py-3">
            <SparkleIcon width="16" height="16" className="text-accent" />
            <span className="text-sm font-semibold text-ink">AI copilot</span>
            {contextLabel && (
              <span className="badge ml-auto bg-blue-50 text-accent" title="Copilot has this campaign as context">
                {contextLabel}
              </span>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Ask me to draft, rewrite, or sharpen any outreach. Try:
                </p>
                <div className="flex flex-col gap-2">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => (q.endsWith(": ") ? setInput(q) : send(q))}
                      className="rounded-lg border border-line bg-white px-3 py-2 text-left text-xs text-ink transition-colors hover:border-accent/40 hover:bg-[#f7f7f4]"
                    >
                      {q.trim()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-accent text-white"
                      : "border border-line bg-[#f7f7f4] text-ink"
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                  {m.role === "assistant" && (
                    <div className="mt-1.5 flex justify-end">
                      <CopyButton text={m.content} label="Copy" />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Thinking…
              </div>
            )}
          </div>

          <div className="border-t border-line p-3">
            <div className="mb-2">
              <TemplatePicker
                onInsert={(text) =>
                  setInput((v) => (v.trim() ? `${v}\n${text}` : text))
                }
              />
            </div>
            <div className="flex items-end gap-2">
              <textarea
                className="input max-h-28 min-h-[40px] resize-none py-2"
                rows={1}
                placeholder="Ask the copilot…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={busy}
              />
              <button className="btn-primary px-3 py-2" onClick={() => send()} disabled={busy || !input.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
