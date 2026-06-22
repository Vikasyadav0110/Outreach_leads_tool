"use client";

import { useState } from "react";
import EmptyState from "./EmptyState";
import ErrorAlert from "./ErrorAlert";
import { toast } from "./toast";
import { TrashIcon } from "./icons";

const CHANNELS = [
  { key: "email", label: "Email", cls: "bg-blue-50 text-accent" },
  { key: "whatsapp", label: "WhatsApp", cls: "bg-green-50 text-success" },
  { key: "call", label: "Call", cls: "bg-violet-50 text-violet-700" },
];
const chanMeta = (k) => CHANNELS.find((c) => c.key === k) || CHANNELS[0];

const blankStep = () => ({ channel: "email", dayOffset: 0, label: "" });

// Editable ordered step list shared by the create form and inline edit.
function StepEditor({ steps, setSteps }) {
  const update = (i, patch) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i) => setSteps(steps.filter((_, j) => j !== i));
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="w-5 shrink-0 text-center text-xs font-medium text-muted">{i + 1}</span>
          <select className="input w-auto" value={s.channel} onChange={(e) => update(i, { channel: e.target.value })} aria-label="Channel">
            {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted">
            +<input type="number" min="0" className="input w-16" value={s.dayOffset} onChange={(e) => update(i, { dayOffset: e.target.value })} aria-label="Day offset" />d
          </label>
          <input className="input min-w-0 flex-1" placeholder="Label (e.g. Bump #1)" value={s.label} onChange={(e) => update(i, { label: e.target.value })} aria-label="Step label" />
          <button type="button" onClick={() => remove(i)} aria-label={`Remove step ${i + 1}`} className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-danger">
            <TrashIcon width="14" height="14" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setSteps([...steps, blankStep()])} className="text-xs font-medium text-accent hover:underline">
        + Add step
      </button>
    </div>
  );
}

export default function SequencesManager({ initial }) {
  const [items, setItems] = useState(initial || []);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState([blankStep()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editSteps, setEditSteps] = useState([]);

  async function add() {
    setError("");
    if (!name.trim()) return setError("Cadence name is required.");
    if (!steps.length) return setError("Add at least one step.");
    setBusy(true);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, steps }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save.");
      setItems((x) => [d.sequence, ...x]);
      setName(""); setSteps([blankStep()]);
      toast("Cadence saved.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function startEdit(seq) {
    setEditId(seq.id);
    setEditName(seq.name);
    setEditSteps(seq.steps.length ? seq.steps.map((s) => ({ ...s })) : [blankStep()]);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sequences/${editId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, steps: editSteps }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not update.");
      setItems((x) => x.map((s) => (s.id === editId ? d.sequence : s)));
      setEditId(null);
      toast("Cadence updated.");
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  async function del(id) {
    if (!window.confirm("Delete this cadence? Campaigns using it will be detached.")) return;
    try {
      const res = await fetch(`/api/sequences/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((x) => x.filter((s) => s.id !== id));
      toast("Cadence deleted.");
    } catch { toast("Couldn't delete cadence.", "error"); }
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-ink">New cadence</h2>
        <p className="mt-1 text-sm text-muted">An ordered set of follow-up steps. When you contact a lead in a campaign that uses this cadence, each step appears as a dated task in Today.</p>
        <div className="mt-4">
          <label className="label" htmlFor="seq-name">Name</label>
          <input id="seq-name" className="input" placeholder="e.g. Classic 4-touch" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </div>
        <div className="mt-4">
          <span className="label">Steps</span>
          <StepEditor steps={steps} setSteps={setSteps} />
        </div>
        {error && <div className="mt-3"><ErrorAlert message={error} /></div>}
        <div className="mt-4">
          <button className="btn-primary" onClick={add} disabled={busy}>{busy ? "Saving…" : "Save cadence"}</button>
        </div>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <EmptyState title="No cadences yet" hint="Define a multi-step follow-up above, then attach it to a campaign." />
      ) : (
        <div className="space-y-4">
          {items.map((seq) => (
            <div key={seq.id} className="card p-5">
              {editId === seq.id ? (
                <>
                  <input className="input mb-3" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Cadence name" />
                  <StepEditor steps={editSteps} setSteps={setEditSteps} />
                  <div className="mt-4 flex gap-2">
                    <button className="btn-primary px-4 py-2 text-sm" onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                    <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setEditId(null)} disabled={busy}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-semibold text-ink">{seq.name}</h4>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => startEdit(seq)} className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/5">Edit</button>
                      <button type="button" onClick={() => del(seq.id)} aria-label={`Delete ${seq.name}`} className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-danger">
                        <TrashIcon width="15" height="15" />
                      </button>
                    </div>
                  </div>
                  <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    {seq.steps.map((s, i) => {
                      const m = chanMeta(s.channel);
                      return (
                        <li key={i} className="flex items-center gap-2">
                          <span className={`badge ${m.cls}`}>{m.label}</span>
                          <span className="text-muted">+{s.dayOffset}d{s.label ? ` · ${s.label}` : ""}</span>
                          {i < seq.steps.length - 1 && <span className="text-muted/50">→</span>}
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
