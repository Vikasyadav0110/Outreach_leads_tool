"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { fmtDate } from "./format";
import { toast } from "./toast";

// Focus mode: a full-screen, keyboard-driven flow over the due follow-ups, so
// you can rip through the chase queue one card at a time without the page chrome.
// Keys:  E = mark contacted (sent)   R = replied   S = snooze 1 day
//        → / Enter = skip to next    Esc = close
// Each action hits an existing API (engagement or task snooze) and advances.
export default function FocusMode({ tasks = [], onClose, onResolve }) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const total = tasks.length;
  const t = tasks[i];
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  function next() {
    setI((n) => Math.min(n + 1, total));
  }

  // Mark the lead's engagement for this task's campaign. setEngagement on the
  // server auto-completes open tasks for replied/meeting/won/lost.
  async function engage(engagement) {
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${t.leadId}/engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: t.campaignId, engagement }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed.");
      onResolve?.(t.id);
      setDone((d) => d + 1);
      next();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function snooze() {
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", id: t.id, days: 1 }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed.");
      onResolve?.(t.id);
      setDone((d) => d + 1);
      next();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", id: t.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed.");
      onResolve?.(t.id);
      setDone((d) => d + 1);
      next();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") return closeRef.current?.();
      if (busy || !t) return;
      const k = e.key.toLowerCase();
      if (k === "e") { e.preventDefault(); engage("contacted"); }
      else if (k === "r") { e.preventDefault(); engage("replied"); }
      else if (k === "s") { e.preventDefault(); snooze(); }
      else if (k === "d") { e.preventDefault(); complete(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [t, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  if (typeof document === "undefined") return null;

  const finished = !t; // ran off the end

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-canvas/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Focus mode">
      {/* top bar */}
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="text-sm font-medium text-ink">
          Focus mode
          <span className="ml-2 font-normal text-muted">
            {finished ? `${done} handled` : `${Math.min(i + 1, total)} / ${total}`}
          </span>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-medium text-muted hover:text-ink">
          Close (Esc)
        </button>
      </div>

      {/* progress bar */}
      <div className="h-1 w-full bg-[#f3f3f0]">
        <div className="h-1 bg-accent transition-all" style={{ width: `${total ? (Math.min(i, total) / total) * 100 : 100}%` }} />
      </div>

      {/* card */}
      <div className="flex flex-1 items-center justify-center p-4">
        {finished ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h3 className="text-base font-semibold text-ink">All caught up</h3>
            <p className="mt-1 text-sm text-muted">You handled {done} follow-up{done === 1 ? "" : "s"}.</p>
            <button type="button" onClick={onClose} className="btn-primary mt-4 px-4 py-2 text-sm">Done</button>
          </div>
        ) : (
          <div className="w-full max-w-md">
            <div className="card p-6">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${t.overdue ? "bg-danger" : "bg-accent"}`} aria-hidden="true" />
                <span className="text-xs font-medium text-muted">
                  {t.overdue ? "Overdue" : "Due"}{t.dueAt ? ` · ${fmtDate(t.dueAt)}` : ""}
                </span>
              </div>
              <h2 className="mt-2 text-lg font-semibold text-ink">{t.leadName}</h2>
              <p className="mt-0.5 text-sm text-muted">
                {t.niche ? t.niche : ""}{t.city ? ` · ${t.city}` : ""}
              </p>
              {t.note && <p className="mt-3 rounded-lg bg-[#f7f7f4] px-3 py-2 text-sm text-ink">{t.note}</p>}
              <Link href={`/campaign/${t.campaignId}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                Open campaign to send →
              </Link>
            </div>

            {/* actions */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" onClick={() => engage("contacted")} disabled={busy} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-[#1647b8] disabled:opacity-50">
                Sent <kbd className="ml-1 opacity-70">E</kbd>
              </button>
              <button type="button" onClick={() => engage("replied")} disabled={busy} className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-warning hover:bg-amber-50 disabled:opacity-50">
                Replied <kbd className="ml-1 opacity-70">R</kbd>
              </button>
              <button type="button" onClick={snooze} disabled={busy} className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-muted hover:text-ink disabled:opacity-50">
                Snooze <kbd className="ml-1 opacity-70">S</kbd>
              </button>
              <button type="button" onClick={next} disabled={busy} className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-muted hover:text-ink disabled:opacity-50">
                Skip <kbd className="ml-1 opacity-70">→</kbd>
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted">
              <kbd>E</kbd> sent · <kbd>R</kbd> replied · <kbd>S</kbd> snooze · <kbd>D</kbd> done · <kbd>→</kbd> skip · <kbd>Esc</kbd> close
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
