"use client";

import { useState } from "react";
import CopyButton from "./CopyButton";
import StatusSelect from "./StatusSelect";
import StatusBadge from "./StatusBadge";
import { toDigits, gmailHref, waHref } from "./contact";

const TABS = [
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "call", label: "Call Script" },
];

// Match each message to its qualification card (by name) so we can reach the
// real phone/email the qualifier found. Names come straight from Agent 2 into
// Agent 3, so an exact (case-insensitive) match is reliable.
function buildContactMap(qualified) {
  const map = new Map();
  (qualified || []).forEach((c) => {
    if (c && c.name) map.set(c.name.trim().toLowerCase(), c);
  });
  return map;
}

// ---- icons --------------------------------------------------------------

function WhatsAppIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

// ---- send button (anchor when actionable, disabled button otherwise) -----

function SendButton({ href, external, variant, icon, label, disabledLabel, onSent, mock }) {
  const styles = {
    whatsapp: "bg-success text-white hover:bg-[#046c4e]",
    email: "bg-accent text-white hover:bg-[#1647b8]",
    call: "border border-line bg-white text-ink hover:bg-[#f3f3f0]",
  };

  // In mock mode, always render a disabled button — never open wa.me/mailto/tel
  // to a fabricated number/address, regardless of whether the href resolved.
  if (mock) {
    return (
      <button type="button" disabled aria-disabled="true" className="btn cursor-not-allowed border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 opacity-80">
        {icon}
        {label} <span className="font-normal opacity-70">(Simulated)</span>
      </button>
    );
  }

  if (!href) {
    return (
      <button type="button" disabled className="btn cursor-not-allowed border border-line bg-white px-3 py-1.5 text-xs text-muted opacity-60">
        {icon}
        {disabledLabel}
      </button>
    );
  }

  return (
    <a
      href={href}
      onClick={onSent}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`btn px-3 py-1.5 text-xs ${styles[variant]}`}
    >
      {icon}
      {label}
    </a>
  );
}

// ---- one message --------------------------------------------------------

function MessageBlock({ msg, contact, mock, onMark, saving }) {
  const [tab, setTab] = useState("email");
  const [nudge, setNudge] = useState(false); // pulse "Mark as sent" after a Send click

  const emailText = `Subject: ${msg.email?.subject || ""}\n\n${msg.email?.body || ""}`;

  // In mock mode, never build real hrefs — pass them as null so SendButton
  // shows the disabled (Simulated) state via its mock guard.
  const digits = mock ? null : toDigits(contact?.whatsapp);
  const waLink = mock ? null : waHref(contact?.whatsapp, msg.whatsapp);
  const mailLink = mock ? null : gmailHref(contact?.email, msg.email?.subject, msg.email?.body);
  const telHref = digits ? `tel:+${digits}` : null;

  // Mark controls are opt-in: only when a writer + lead identity are present
  // (the campaign page passes them; the wizard does not).
  const canMark = !!onMark && msg.leadId != null;
  const engagement = msg.engagement || "";
  const onSent = () => setNudge(true);

  return (
    <div id={msg.leadId != null ? `lead-${msg.leadId}` : undefined} className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{msg.name}</h4>
        {canMark && (
          <div className="flex items-center gap-2">
            {!engagement || engagement === "new" ? (
              <button
                type="button"
                onClick={() => { setNudge(false); onMark(msg.leadId, "contacted"); }}
                disabled={saving}
                className={`rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:bg-[#1647b8] disabled:opacity-50 ${nudge ? "ring-2 ring-accent ring-offset-1 animate-pulse" : ""}`}
              >
                {saving ? "Saving…" : "✓ Mark as sent"}
              </button>
            ) : (
              <StatusBadge status={engagement} kind="engagement" />
            )}
            <StatusSelect value={engagement || "new"} saving={saving} onChange={(next) => onMark(msg.leadId, next)} />
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-150 ${
              tab === t.key
                ? "border-accent font-medium text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "email" && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">
                Subject: <span className="text-ink">{msg.email?.subject}</span>
              </span>
              <div className="flex items-center gap-2">
                <SendButton
                  href={mailLink}
                  mock={mock}
                  external
                  variant="email"
                  icon={<MailIcon />}
                  label="Send email"
                  disabledLabel="No email"
                  onSent={onSent}
                />
                <CopyButton text={emailText} label="Copy" />
              </div>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-[#f7f7f4] p-3 text-sm text-ink">
              {msg.email?.body}
            </pre>
          </div>
        )}

        {tab === "whatsapp" && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">
                {digits ? `To +${digits}` : "No number on file"}
              </span>
              <div className="flex items-center gap-2">
                <SendButton
                  href={waLink}
                  mock={mock}
                  external
                  variant="whatsapp"
                  icon={<WhatsAppIcon />}
                  label="Send on WhatsApp"
                  disabledLabel="No number"
                  onSent={onSent}
                />
                <CopyButton text={msg.whatsapp} label="Copy" />
              </div>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-[#f7f7f4] p-3 text-sm text-ink">
              {msg.whatsapp}
            </pre>
          </div>
        )}

        {tab === "call" && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">
                {digits ? `Dial +${digits}` : "No number on file"}
              </span>
              <div className="flex items-center gap-2">
                <SendButton
                  href={telHref}
                  mock={mock}
                  variant="call"
                  icon={<PhoneIcon />}
                  label="Call"
                  disabledLabel="No number"
                />
                <CopyButton text={msg.callScript} label="Copy" />
              </div>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-[#f7f7f4] p-3 text-sm text-ink">
              {msg.callScript}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessageTabs({ messages, qualified, mock, onMark, savingLeadId }) {
  if (!messages || messages.length === 0) return null;
  const contacts = buildContactMap(qualified);
  return (
    <div className="space-y-4">
      {messages.map((m, i) => (
        <MessageBlock
          key={m.leadId ?? i}
          msg={m}
          contact={contacts.get((m.name || "").trim().toLowerCase())}
          mock={mock}
          onMark={onMark}
          saving={savingLeadId != null && savingLeadId === m.leadId}
        />
      ))}
    </div>
  );
}
