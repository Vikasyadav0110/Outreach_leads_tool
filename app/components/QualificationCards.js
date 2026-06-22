"use client";

import { useState } from "react";
import { toast } from "./toast";

export default function QualificationCards({ cards, onPrep, campaignId, mock }) {
  if (!cards || cards.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((c, i) => (
        <Card key={c.name || i} card={c} onPrep={onPrep} campaignId={campaignId} mock={mock} />
      ))}
    </div>
  );
}

function Card({ card, onPrep, campaignId, mock }) {
  // Local copy so inline edits show immediately (optimistic).
  const [c, setC] = useState(card);

  async function saveField(field, value) {
    const prev = c[field];
    if (value === prev) return;
    setC((x) => ({ ...x, [field]: value })); // optimistic
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/card`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: c.name, [field]: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed.");
      toast("Contact updated.");
    } catch (e) {
      setC((x) => ({ ...x, [field]: prev })); // revert
      toast(e.message, "error");
    }
  }

  const editable = !!campaignId && !mock;

  return (
    <div className="card card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink">{c.name}</h4>
        <span className="badge bg-blue-50 text-accent">{c.serviceTag}</span>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Gap" value={c.exactGap} />
        <EditableRow label="Decision maker" value={c.decisionMaker} editable={editable} onSave={(v) => saveField("decisionMaker", v)} />
        <EditableRow label="WhatsApp" value={c.whatsapp} editable={editable} onSave={(v) => saveField("whatsapp", v)} />
        <EditableRow label="Email" value={c.email} editable={editable} onSave={(v) => saveField("email", v)} />
        <Row label="Hook" value={c.personalizationHook} />
      </dl>

      {onPrep && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => onPrep(c)} className="btn-ghost px-3 py-1 text-xs">
            Prep Meeting
          </button>
          <span className="text-xs text-muted">Open the lead to send →</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-xs font-medium text-muted">{label}</dt>
      <dd className="text-ink">{value || "—"}</dd>
    </div>
  );
}

// A row whose value can be click-to-edit (for fixing a wrong contact). Falls
// back to a plain Row when not editable (mock or no campaignId).
function EditableRow({ label, value, editable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  if (!editable) return <Row label={label} value={value} />;

  function commit() {
    setEditing(false);
    onSave((draft || "").trim());
  }

  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            className="input w-full py-0.5 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => { setDraft(value && value !== "Not found" && value !== "Unknown" ? value : ""); setEditing(true); }}
            className="group flex w-full items-center gap-1 text-left text-ink hover:text-accent"
            title="Click to edit"
          >
            <span>{value || "—"}</span>
            <svg className="opacity-0 transition-opacity group-hover:opacity-60" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        )}
      </dd>
    </div>
  );
}
