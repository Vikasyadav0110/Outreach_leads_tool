"use client";

import { useState } from "react";
import CopyButton from "./CopyButton";
import ErrorAlert from "./ErrorAlert";
import { toast } from "./toast";
import { TEMPLATE_TOKENS } from "./templateVars";
import { TrashIcon } from "./icons";

const CHANNELS = [
  { key: "general", label: "General", cls: "bg-neutral-100 text-muted" },
  { key: "email", label: "Email", cls: "bg-blue-50 text-accent" },
  { key: "whatsapp", label: "WhatsApp", cls: "bg-green-50 text-success" },
  { key: "call", label: "Call", cls: "bg-violet-50 text-violet-700" },
];
const chanMeta = (k) => CHANNELS.find((c) => c.key === k) || CHANNELS[0];

export default function TemplatesManager({ initial }) {
  const [items, setItems] = useState(initial || []);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("general");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    setError("");
    if (!body.trim()) {
      setError("Template body is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/snippets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, channel, body }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save.");
      setItems((x) => [d.snippet, ...x]);
      setTitle("");
      setBody("");
      setChannel("general");
      toast("Template saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function del(id) {
    if (!window.confirm("Delete this template?")) return;
    try {
      const res = await fetch(`/api/snippets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((x) => x.filter((s) => s.id !== id));
      toast("Template deleted.");
    } catch {
      toast("Couldn't delete template.", "error");
    }
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-ink">New template</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="t-title">Title</label>
            <input id="t-title" className="input" placeholder="e.g. Gentle 2nd follow-up" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="label" htmlFor="t-chan">Channel</label>
            <select id="t-chan" className="input" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={busy}>
              {CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="t-body">Body</label>
          <textarea id="t-body" className="input min-h-28" placeholder="Reusable copy — paste into any message…" value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
          <p className="mt-1 text-xs text-muted">
            Tokens auto-fill when you insert from a lead: {TEMPLATE_TOKENS.join(", ")}
          </p>
        </div>
        {error && <div className="mt-3"><ErrorAlert message={error} /></div>}
        <div className="mt-4">
          <button className="btn-primary" onClick={add} disabled={busy}>
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          No templates yet. Save reusable copy above.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((s) => {
            const m = chanMeta(s.channel);
            return (
              <div key={s.id} className="card card-hover p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-ink">{s.title || "Untitled"}</h4>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`badge ${m.cls}`}>{m.label}</span>
                      <span className="text-xs text-muted">Used {s.uses || 0}×</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <CopyButton text={s.body} label="Copy" />
                    <button
                      type="button"
                      onClick={() => del(s.id)}
                      aria-label="Delete template"
                      title="Delete"
                      className="rounded-md p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-danger"
                    >
                      <TrashIcon width="15" height="15" />
                    </button>
                  </div>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[#f7f7f4] p-3 text-sm text-ink">{s.body}</pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
