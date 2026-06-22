"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Stepper from "./Stepper";
import ScoreBadge from "./ScoreBadge";
import MessageTabs from "./MessageTabs";
import ConfirmActionModal from "./ConfirmActionModal";
import EmptyState from "./EmptyState";
import { toast } from "./toast";

const STEPS = [{ label: "Select Leads" }, { label: "Generate Messages" }, { label: "Review & Send" }];

// 3-step campaign builder. Leads are picked from the qualified pool (reusable
// across campaigns), messages are generated on explicit confirm, then reviewed.
export default function CampaignWizard({ qualifiedLeads, mock }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("multi");
  const [picked, setPicked] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [campaign, setCampaign] = useState(null); // created after step 1
  const [confirmGen, setConfirmGen] = useState(false);
  const [busy, setBusy] = useState(false);

  const view = useMemo(
    () => qualifiedLeads.filter((l) => !q || [l.name, l.city, l.niche].some((x) => (x || "").toLowerCase().includes(q.toLowerCase()))),
    [qualifiedLeads, q]
  );
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Step 1 → create campaign + link the picked leads.
  async function createAndLink() {
    if (picked.size === 0) return toast("Select at least one lead.", "error");
    setBusy(true);
    try {
      const cr = await fetch("/api/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "New campaign", channel }),
      });
      const cd = await cr.json();
      if (!cr.ok) throw new Error(cd.error || "Could not create campaign.");
      const link = await fetch(`/api/campaigns/${cd.campaign.id}/leads`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [...picked] }),
      });
      const ld = await link.json();
      if (!link.ok) throw new Error(ld.error || "Could not add leads.");
      setCampaign(ld.campaign);
      setStep(1);
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  // Step 2 → generate messages for all linked leads.
  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/generate-messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not generate messages.");
      setCampaign(d.campaign);
      setConfirmGen(false);
      setStep(2);
      toast(`Generated messages for ${d.written} lead${d.written > 1 ? "s" : ""}.`);
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  if (qualifiedLeads.length === 0) {
    return (
      <EmptyState
        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>}
        title="No qualified leads yet"
        hint="Campaigns are built from qualified leads. Go to Leads, find some, and run Qualify & Score first."
        action={<a href="/leads" className="btn-primary">Go to Leads</a>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Stepper steps={STEPS} current={step} />

      {/* Step 1 — Select Leads */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Campaign name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pune dentists · Email" /></div>
            <div><label className="label">Channel</label>
              <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="multi">Multi (email + WhatsApp + call)</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="call">Call</option>
              </select>
            </div>
          </div>
          <input className="input max-w-xs" placeholder="Search qualified leads…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="table-wrap">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="bg-[#f3f3f0] text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-3 py-2"></th><th className="px-4 py-2">Business</th><th className="px-4 py-2">City</th><th className="px-4 py-2">Score</th><th className="px-4 py-2">In campaigns</th>
              </tr></thead>
              <tbody>
                {view.map((l) => (
                  <tr key={l.id} className={`border-b border-line last:border-0 ${picked.has(l.id) ? "bg-accent/5" : "even:bg-[#fafaf8]"}`}>
                    <td className="px-3 py-2"><input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} className="h-4 w-4 accent-[#1c5bd6]" /></td>
                    <td className="px-4 py-2 font-medium text-ink">{l.name}</td>
                    <td className="px-4 py-2 text-muted">{l.city || "—"}</td>
                    <td className="px-4 py-2"><ScoreBadge score={l.score} /></td>
                    <td className="px-4 py-2 text-muted tabular-nums">{l.campaignCount || "—"}{l.campaignCount ? " (reusable)" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={createAndLink} disabled={busy || picked.size === 0} className="btn-primary disabled:opacity-60">
              {busy
                ? "Creating…"
                : picked.size === 0
                  ? "Select leads to continue"
                  : `Next: ${picked.size} lead${picked.size === 1 ? "" : "s"} → Generate Messages`}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Generate Messages */}
      {step === 1 && campaign && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink">{campaign.name}</h3>
            <p className="mt-1 text-sm text-muted">{campaign.members.length} leads · channel: {campaign.channel}</p>
            <p className="mt-3 text-xs text-muted">AI will draft an email, WhatsApp message, and call script for each lead. {!mock && <span className="text-amber-700">Uses AI credits.</span>}</p>
            <button type="button" onClick={() => setConfirmGen(true)} className="btn-primary mt-4">Generate Messages</button>
          </div>
          <button type="button" onClick={() => setStep(0)} className="text-xs text-muted hover:text-ink">← Back to leads</button>
          {confirmGen && (
            <ConfirmActionModal
              title={`Generate messages for ${campaign.members.length} leads?`}
              body="This drafts email + WhatsApp + call script per lead and uses AI credits."
              confirmLabel="Generate Messages" busy={busy}
              onConfirm={generate} onClose={() => !busy && setConfirmGen(false)}
            />
          )}
        </div>
      )}

      {/* Step 3 — Review & Send */}
      {step === 2 && campaign && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">{campaign.name} — review &amp; send</h3>
            <button type="button" onClick={() => router.push(`/campaign/${campaign.id}`)} className="btn-ghost px-3 py-1.5 text-sm">Open campaign</button>
          </div>
          <MessageTabs messages={campaign.messages} qualified={campaign.qualified} mock={mock} />
        </div>
      )}
    </div>
  );
}
