"use client";

import { useEffect, useRef, useState } from "react";
import CopyButton from "./CopyButton";
import ErrorAlert from "./ErrorAlert";

// Modal: textarea for pasted conversation context -> calls Agent 4 -> renders
// the meeting kit with copy buttons. `lead` and `domain` come from the caller.
export default function MeetingModal({ domain, lead, onClose }) {
  const [context, setContext] = useState("");
  const [kit, setKit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Esc to close, scroll-lock the body, initial focus, and a simple Tab trap.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  async function generate() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/agents/prep-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, lead, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not prep the meeting.");
      setKit(data.kit);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Meeting kit for ${lead?.name || "lead"}`}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="card section-enter my-8 w-full max-w-2xl p-6 shadow-pop outline-none"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink">Meeting kit</h3>
            <p className="text-sm text-muted">{lead?.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-2.5 py-1 text-xs"
          >
            Close
          </button>
        </div>

        {!kit && (
          <div className="mt-5">
            <label className="label" htmlFor="ctx">
              Conversation context (optional) — paste anything already said
            </label>
            <textarea
              id="ctx"
              className="input min-h-28"
              placeholder="e.g. Spoke on WhatsApp, owner said they already have an Instagram page and don't see the point of a website…"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={busy}
            />
            {error && (
              <div className="mt-3">
                <ErrorAlert message={error} onRetry={generate} retrying={busy} />
              </div>
            )}
            <div className="mt-4">
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="btn-primary"
              >
                {busy ? "Preparing…" : "Generate meeting kit"}
              </button>
            </div>
          </div>
        )}

        {kit && (
          <div className="mt-5 space-y-5">
            <Section title="Business intel" text={kit.intel} />
            <Section title="Opening question" text={kit.openingQuestion} />

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Top objections
              </div>
              <div className="space-y-3">
                {(kit.objections || []).map((o, i) => (
                  <div key={i} className="rounded-lg bg-[#f7f7f4] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">
                        {o.objection}
                      </p>
                      <CopyButton text={o.response} />
                    </div>
                    <p className="mt-1 text-sm text-muted">{o.response}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Closing scripts
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {["soft", "trial", "urgency", "direct"].map((k) => (
                  <div key={k} className="rounded-lg bg-[#f7f7f4] p-3">
                    <div className="flex items-center justify-between">
                      <span className="badge bg-blue-50 capitalize text-accent">
                        {k}
                      </span>
                      <CopyButton text={kit.closingScripts?.[k]} />
                    </div>
                    <p className="mt-2 text-sm text-ink">
                      {kit.closingScripts?.[k]}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Section
              title="10-second positioning line"
              text={kit.positioningLine}
              copyable
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, text, copyable }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {title}
        </span>
        {copyable && <CopyButton text={text} />}
      </div>
      <p className="text-sm text-ink">{text}</p>
    </div>
  );
}
