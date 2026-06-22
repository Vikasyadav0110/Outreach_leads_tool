"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ScoreBadge from "./ScoreBadge";
import StatusBadge from "./StatusBadge";
import { DomainChip } from "./Brand";
import { toDigits, gmailHref, waHref } from "./contact";
import { LEAD_LIFECYCLE } from "./status";
import { fmtAge, fmtDateTime } from "./format";
import { toast } from "./toast";
import MeetingModal from "./MeetingModal";

// Timeline dot color per event kind (full Tailwind classes for the JIT).
const EVENT_DOT = {
  found: "bg-accent2",
  qualified: "bg-accent",
  contact_found: "bg-success",
  status: "bg-sky-500",
  engagement: "bg-warning",
  note: "bg-neutral-400",
  suppressed: "bg-danger",
  unsuppressed: "bg-success",
};

// New-model per-lead detail drawer for the Leads hub. Shows the qualification
// card, lets you Find contact (enrich), Qualify, set lifecycle status, and edit
// notes — all via the /api/leads/* routes. Lead-scoped (no campaign).
function Field({ label, children }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-xs font-medium text-muted">{label}</span>
      <span className="min-w-0 break-words text-ink">{children}</span>
    </div>
  );
}

// Contact action: a real link when reachable and not mocked, an accessible
// disabled button otherwise (screen readers announce it disabled, not a link).
function ContactLink({ href, tone, label, disabledLabel, mock }) {
  if (mock) {
    return (
      <button type="button" disabled aria-disabled="true" className="btn cursor-not-allowed border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 opacity-80">
        {label} <span className="font-normal opacity-70">(Simulated)</span>
      </button>
    );
  }
  if (!href) {
    return (
      <button type="button" disabled aria-disabled="true" className="btn cursor-not-allowed border border-line bg-white px-3 py-1.5 text-xs text-muted opacity-60">
        {disabledLabel}
      </button>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`btn px-3 py-1.5 text-xs ${tone}`}>
      {label}
    </a>
  );
}

export default function LeadDetailDrawer({ lead, mock = false, onClose, onChanged }) {
  const router = useRouter();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState("");
  const [draftNotes, setDraftNotes] = useState(lead.notes || "");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [suppressed, setSuppressed] = useState(!!lead.suppressed);
  const card = lead.card || {};
  const blocked = suppressed; // do-not-contact: disable contact + AI actions
  const reachable = (v) => v && v !== "Not found" && v !== "Unknown";

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeRef.current?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);
  // Focus the panel once it's portaled in (mounted gates the render).
  useEffect(() => { if (mounted) panelRef.current?.focus(); }, [mounted]);
  useEffect(() => setDraftNotes(lead.notes || ""), [lead.id, lead.notes]);
  useEffect(() => setSuppressed(!!lead.suppressed), [lead.id, lead.suppressed]);
  // Load the activity timeline for this lead.
  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${lead.id}/events`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => { if (alive) setEvents(d.events || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [lead.id]);

  async function toggleSuppress() {
    const next = !suppressed;
    if (next && !window.confirm("Mark this lead do-not-contact? Enrichment and contact actions will be blocked.")) return;
    const reason = next ? (window.prompt("Reason (optional):", "") || "") : "";
    setBusy("suppress");
    try {
      const res = await fetch(`/api/leads/${lead.id}/suppress`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppressed: next, reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed.");
      setSuppressed(next);
      toast(next ? "Marked do-not-contact." : "Suppression removed.");
      // Refresh the timeline to include the new suppressed/unsuppressed event.
      fetch(`/api/leads/${lead.id}/events`).then((r) => r.json()).then((x) => setEvents(x.events || [])).catch(() => {});
      onChanged?.(); router.refresh();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(""); }
  }

  async function api(path, body, label) {
    setBusy(label);
    try {
      const res = await fetch(path, {
        method: body?._method || "POST",
        headers: { "Content-Type": "application/json" },
        body: body && !body._method ? JSON.stringify(body) : body ? JSON.stringify({ ...body, _method: undefined }) : undefined,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed.");
      return d;
    } catch (e) {
      toast(e.message, "error");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function qualify() {
    setBusy("qualify");
    try {
      const res = await fetch("/api/leads/qualify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [lead.id] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Qualify failed.");
      toast("Lead qualified.");
      onChanged?.(); router.refresh();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(""); }
  }

  async function findContact() {
    setBusy("find");
    try {
      const res = await fetch(`/api/leads/${lead.id}/enrich`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not find contact.");
      toast(d.found ? `Contact found via ${d.source || "search"}.` : "No public contact found.");
      onChanged?.(); router.refresh();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(""); }
  }

  async function patch(body, label) {
    setBusy(label);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed.");
      onChanged?.(); router.refresh();
      return true;
    } catch (e) { toast(e.message, "error"); return false; } finally { setBusy(""); }
  }

  const waLink = waHref(card.whatsapp, "");
  const mailLink = gmailHref(card.email, "", "");
  const digits = toDigits(card.whatsapp);

  if (!mounted) return null;

  const domain = lead.module === "international" ? "international" : "local";
  const meetingLead = {
    name: lead.name,
    exactGap: card.exactGap || lead.gap || "",
    decisionMaker: card.decisionMaker || "",
    whatsapp: card.whatsapp || "",
    email: card.email || "",
    personalizationHook: card.personalizationHook || "",
    serviceTag: card.serviceTag || "",
  };

  const drawerPortal = createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Lead: ${lead.name}`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className="absolute right-0 top-0 flex h-full w-full max-w-md animate-fadeInUp flex-col border-l border-line bg-canvas shadow-pop outline-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line bg-card px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-ink">{lead.name}</h3>
              <ScoreBadge score={lead.score} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              {lead.domain && <DomainChip domain={lead.domain} />}
              {lead.city && <span>{lead.city}</span>}
              <StatusBadge status={lead.status} />
              {lead.source && <span className="rounded-full bg-neutral-100 px-2 py-0.5">via {lead.source.length > 24 ? lead.source.slice(0, 24) + "…" : lead.source}</span>}
              {lead.createdAt && <span>· found {fmtAge(lead.createdAt)}</span>}
              {suppressed && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-danger">⛔ Do not contact</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Do-not-contact banner */}
          {suppressed && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-danger">
              <span className="font-semibold">Do not contact.</span>{" "}
              {lead.suppressedReason ? lead.suppressedReason : "This lead is suppressed."} Contact &amp; enrichment are blocked.
            </div>
          )}

          {/* Status + quick contact */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">Status</span>
              <select className="input w-auto py-1 text-sm disabled:opacity-50" value={lead.status} onChange={(e) => patch({ status: e.target.value }, "status")} disabled={!!busy} aria-label="Lead status">
                {LEAD_LIFECYCLE.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ContactLink mock={mock} href={blocked ? null : waLink} tone="bg-success text-white hover:bg-[#046c4e]" label="WhatsApp" disabledLabel={blocked ? "Blocked (DNC)" : "No WhatsApp"} />
              <ContactLink mock={mock} href={blocked ? null : mailLink} tone="bg-accent text-white hover:bg-[#1647b8]" label="Email" disabledLabel={blocked ? "Blocked (DNC)" : "No email"} />
              <ContactLink mock={mock} href={blocked ? null : (digits ? `tel:+${digits}` : null)} tone="border border-line bg-white text-ink hover:bg-[#f3f3f0]" label="Call" disabledLabel={blocked ? "Blocked (DNC)" : "No number"} />
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <button type="button" onClick={toggleSuppress} disabled={busy === "suppress"} className={`text-xs font-medium disabled:opacity-50 ${suppressed ? "text-accent hover:underline" : "text-danger hover:underline"}`}>
                {busy === "suppress" ? "Saving…" : suppressed ? "↩ Remove do-not-contact" : "⛔ Mark do-not-contact"}
              </button>
            </div>
          </div>

          {/* Qualification */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Qualification</h4>
            {!lead.qualified && (
              <div className="mb-2 rounded-lg bg-[#f7f7f4] px-3 py-2.5">
                <p className="text-xs text-muted">Not qualified yet — find the decision-maker, exact gap, and contact.</p>
                <button type="button" onClick={qualify} disabled={!!busy || blocked} title={blocked ? "Blocked — lead is do-not-contact" : undefined} className="btn-primary mt-2 px-3 py-1.5 text-xs disabled:opacity-60 disabled:cursor-not-allowed">
                  {busy === "qualify" ? "Qualifying…" : "Qualify & Score"}
                </button>
              </div>
            )}
            <div className="card space-y-2 p-4">
              <Field label="Gap">{card.exactGap || lead.gap || "—"}</Field>
              <Field label="Decision maker">{card.decisionMaker || "—"}</Field>
              <Field label="WhatsApp">{card.whatsapp || "—"}</Field>
              <Field label="Email">{card.email || "—"}</Field>
              {card.linkedin && <Field label="LinkedIn"><a href={card.linkedin} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{card.linkedin.replace(/^https?:\/\/(www\.)?/, "").slice(0, 36)}</a></Field>}
              <Field label="Website">{lead.website && lead.website !== "none" ? lead.website : "none"}</Field>
              {(!reachable(card.email) && !reachable(card.whatsapp)) && (
                <div className="border-t border-line pt-2">
                  <button type="button" onClick={findContact} disabled={!!busy || blocked} title={blocked ? "Blocked — lead is do-not-contact" : undefined} className="btn-ghost w-full px-3 py-1.5 text-xs disabled:opacity-60 disabled:cursor-not-allowed">
                    {busy === "find" ? "Searching the web…" : blocked ? "🚫 Find blocked (do-not-contact)" : "🔎 Find contact details"}
                  </button>
                  <p className="mt-1 text-center text-[11px] text-muted">Web search → Hunter → Apollo · public info only</p>
                </div>
              )}
              {card.contactSource && (reachable(card.email) || reachable(card.whatsapp)) && (
                <p className="text-[11px] text-muted">Contact found via {card.contactSource}.</p>
              )}
            </div>
          </section>

          {/* Prep Meeting — only when the lead is qualified */}
          {lead.qualified && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Meeting</h4>
              <button
                type="button"
                onClick={() => setMeetingOpen(true)}
                className="btn-ghost w-full px-3 py-2 text-sm"
              >
                🤝 Prep Meeting Kit
              </button>
              <p className="mt-1 text-center text-[11px] text-muted">AI-generated intel, objections &amp; closing scripts</p>
            </section>
          )}

          {/* Notes */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Notes</h4>
            <textarea aria-label="Lead notes" className="input min-h-24" placeholder="Log what happened — call outcome, objection, next step…" value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />
            {draftNotes !== (lead.notes || "") && (
              <button className="btn-primary mt-2 px-3 py-1.5 text-xs" onClick={() => patch({ notes: draftNotes }, "notes")} disabled={busy === "notes"}>
                {busy === "notes" ? "Saving…" : "Save notes"}
              </button>
            )}
          </section>

          {lead.campaignCount > 0 && (
            <p className="text-xs text-muted">In {lead.campaignCount} campaign{lead.campaignCount > 1 ? "s" : ""}.</p>
          )}

          {/* Activity timeline */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Activity</h4>
            {events.length === 0 ? (
              <p className="text-xs text-muted">No activity logged yet.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-line pl-4">
                {events.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${EVENT_DOT[ev.kind] || "bg-neutral-300"}`} aria-hidden="true" />
                    <div className="text-sm text-ink">{ev.detail || ev.kind}</div>
                    <div className="text-[11px] text-muted">{fmtDateTime(ev.createdAt)} · {fmtAge(ev.createdAt)}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body
  );

  // Stack MeetingModal above the drawer (z-[60] > z-50) when requested.
  if (meetingOpen) {
    return (
      <>
        {drawerPortal}
        {createPortal(
          <div className="relative z-[60]">
            <MeetingModal domain={domain} lead={meetingLead} onClose={() => setMeetingOpen(false)} />
          </div>,
          document.body
        )}
      </>
    );
  }

  return drawerPortal;
}

