"use client";

import { useEffect, useRef, useState } from "react";
import ScoreBadge from "./ScoreBadge";
import StatusSelect from "./StatusSelect";
import CopyButton from "./CopyButton";
import TemplatePicker from "./TemplatePicker";
import { DomainChip } from "./Brand";
import { toDigits, waHref, mailHref } from "./contact";
import { fillTemplate } from "./templateVars";
import { fmtDateTime } from "./format";

function Field({ label, children }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-xs font-medium text-muted">{label}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}

function ActionLink({ href, external, tone, children, disabledLabel }) {
  const styles = {
    whatsapp: "bg-success text-white hover:bg-[#046c4e]",
    email: "bg-accent text-white hover:bg-[#1647b8]",
    call: "border border-line bg-white text-ink hover:bg-[#f3f3f0]",
  };
  if (!href) {
    return (
      <button type="button" disabled className="btn cursor-not-allowed border border-line bg-white px-3 py-1.5 text-xs text-muted opacity-60">
        {disabledLabel}
      </button>
    );
  }
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={`btn px-3 py-1.5 text-xs ${styles[tone]}`}>
      {children}
    </a>
  );
}

export default function LeadDrawer({
  lead,
  card,
  message,
  domain,
  status,
  notes,
  updatedAt,
  createdAt,
  mock,
  onStatusChange,
  onSaveNotes,
  onPrep,
  onClose,
}) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [draftNotes, setDraftNotes] = useState(notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [compose, setCompose] = useState("");
  const [profile, setProfile] = useState({});

  // Load the sender profile so inserted templates can fill {me}/{myLocation}.
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => d.settings && setProfile(d.settings))
      .catch(() => {});
  }, []);

  const templateVars = {
    business: lead.name,
    name: card?.decisionMaker,
    gap: card?.exactGap || lead.gap,
    service: card?.serviceTag,
    city: lead.city,
    me: profile.name,
    myLocation: profile.location,
  };
  const dirty = (draftNotes || "") !== (notes || "");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const digits = mock ? null : toDigits(card?.whatsapp);
  const waLink = mock ? null : waHref(card?.whatsapp, message?.whatsapp);
  const mailLink = mock ? null : mailHref(card?.email, message?.email?.subject, message?.email?.body);
  const telHref = digits ? `tel:+${digits}` : null;

  // Touch timeline derived from available data.
  const timeline = [
    { label: `Found via ${lead.source || "research"}`, at: createdAt, on: true },
    { label: "Qualified", at: null, on: !!card },
    { label: "Messages written", at: null, on: !!message },
    { label: `Status: ${status}`, at: updatedAt, on: status && status !== "new" },
  ];

  async function saveNotes() {
    setSavingNotes(true);
    await onSaveNotes(draftNotes);
    setSavingNotes(false);
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Lead: ${lead.name}`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute right-0 top-0 flex h-full w-full max-w-md animate-fadeInUp flex-col border-l border-line bg-canvas shadow-pop outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line bg-card px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-ink">{lead.name}</h3>
              <ScoreBadge score={lead.score} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <DomainChip domain={domain} />
              {lead.category && <span>{lead.category}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Status + quick actions */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Status</span>
              <StatusSelect value={status} onChange={onStatusChange} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionLink href={waLink} external tone="whatsapp" disabledLabel="No WhatsApp">Send WhatsApp</ActionLink>
              <ActionLink href={mailLink} tone="email" disabledLabel="No email">Send email</ActionLink>
              <ActionLink href={telHref} tone="call" disabledLabel="No number">Call</ActionLink>
            </div>
            {onPrep && (
              <button type="button" onClick={onPrep} className="btn-ghost mt-2 w-full px-3 py-1.5 text-xs">
                Prep meeting kit
              </button>
            )}
          </div>

          {/* Qualification */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Qualification</h4>
            {!card && (
              <p className="mb-2 rounded-lg bg-[#f7f7f4] px-3 py-2 text-xs text-muted">
                Not qualified yet — only HIGH-priority leads (score ≥ 7) are
                auto-qualified, so this lead has no contact details or messages.
              </p>
            )}
            <div className="card space-y-2 p-4">
              <Field label="Gap">{card?.exactGap || lead.gap || "—"}</Field>
              <Field label="Decision maker">{card?.decisionMaker || "—"}</Field>
              <Field label="WhatsApp">{card?.whatsapp || "—"}</Field>
              <Field label="Email">{card?.email || "—"}</Field>
              <Field label="Hook">{card?.personalizationHook || "—"}</Field>
              <Field label="Pitch">{card?.serviceTag || "—"}</Field>
              <Field label="Website">{lead.website && lead.website !== "none" ? lead.website : "none"}</Field>
            </div>
          </section>

          {/* Messages */}
          {message && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Messages</h4>
              <div className="space-y-3">
                <div className="card p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">Email · <span className="text-ink">{message.email?.subject}</span></span>
                    <CopyButton text={`Subject: ${message.email?.subject || ""}\n\n${message.email?.body || ""}`} label="Copy" />
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-ink">{message.email?.body}</pre>
                </div>
                <div className="card p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">WhatsApp</span>
                    <CopyButton text={message.whatsapp} label="Copy" />
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-ink">{message.whatsapp}</pre>
                </div>
                <div className="card p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">Call script</span>
                    <CopyButton text={message.callScript} label="Copy" />
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-ink">{message.callScript}</pre>
                </div>
              </div>
            </section>
          )}

          {/* Compose a custom message (free text + templates) */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Compose</h4>
            <div className="mb-2">
              <TemplatePicker
                up={false}
                onInsert={(t) => {
                  const filled = fillTemplate(t, templateVars);
                  setCompose((d) => (d.trim() ? `${d}\n${filled}` : filled));
                }}
              />
            </div>
            <textarea
              className="input min-h-24"
              placeholder="Write a custom message, or insert a template…"
              value={compose}
              onChange={(e) => setCompose(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionLink
                href={!mock && compose.trim() ? waHref(card?.whatsapp, compose) : null}
                external
                tone="whatsapp"
                disabledLabel="WhatsApp"
              >
                Send on WhatsApp
              </ActionLink>
              <ActionLink
                href={!mock && compose.trim() ? mailHref(card?.email, "Quick note", compose) : null}
                tone="email"
                disabledLabel="Email"
              >
                Send email
              </ActionLink>
              <CopyButton text={compose} label="Copy" />
            </div>
          </section>

          {/* Notes */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Notes</h4>
            <textarea
              className="input min-h-24"
              placeholder="Log what happened — call outcome, objection, next step…"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
            />
            {dirty && (
              <div className="mt-2">
                <button className="btn-primary px-3 py-1.5 text-xs" onClick={saveNotes} disabled={savingNotes}>
                  {savingNotes ? "Saving…" : "Save notes"}
                </button>
              </div>
            )}
          </section>

          {/* Timeline */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Timeline</h4>
            <ol className="space-y-3">
              {timeline.map((t, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${t.on ? "bg-accent" : "bg-neutral-200"}`} />
                  <div className="text-sm">
                    <div className={t.on ? "text-ink" : "text-muted"}>{t.label}</div>
                    {t.at && <div className="text-xs text-muted">{fmtDateTime(t.at)}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
