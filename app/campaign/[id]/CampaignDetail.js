"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EmptyState from "@/app/components/EmptyState";
import MessageTabs from "@/app/components/MessageTabs";
import MeetingModal from "@/app/components/MeetingModal";
import ConfirmActionModal from "@/app/components/ConfirmActionModal";
import StatusBadge from "@/app/components/StatusBadge";
import StatusSelect from "@/app/components/StatusSelect";
import ScoreBadge from "@/app/components/ScoreBadge";
import PipelineBoard from "@/app/components/PipelineBoard";
import LeadDetailDrawer from "@/app/components/LeadDetailDrawer";
import { KpiCard } from "@/app/components/charts";
import { LEAD_STATUSES, statusMeta } from "@/app/components/status";
import { saveEngagement } from "@/app/components/outcomes";
import { draftKey, loadDraft, saveDraft } from "@/app/components/persist";
import { toast } from "@/app/components/toast";

// Review & Send for an existing campaign. Leads are already attached (from the
// Leads hub / wizard); here you Generate Messages (if not yet), then SEND each
// message manually and Mark as sent / track engagement per lead.
export default function CampaignDetail({ initialCampaign, sequences = [], mock }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState(initialCampaign);
  const [savingSeq, setSavingSeq] = useState(false);
  const [confirmGen, setConfirmGen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingLeadId, setSavingLeadId] = useState(null);
  const [meetingLead, setMeetingLead] = useState(null);
  const [openLead, setOpenLead] = useState(null);
  const [view, setView] = useState("board"); // 'board' | 'list'

  // Remember the user's last-used view across campaigns (per device).
  const VIEW_KEY = draftKey("campaign-view");
  useEffect(() => {
    const v = loadDraft(VIEW_KEY);
    if (v === "board" || v === "list") setView(v);
  }, [VIEW_KEY]);
  function switchView(v) { setView(v); saveDraft(VIEW_KEY, v); }

  const hasMessages = campaign.messages.length > 0;

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
      toast(`Generated messages for ${d.written} lead${d.written > 1 ? "s" : ""}.`);
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  // Set a lead's engagement (Mark as sent / replied / …). Optimistic, then
  // re-hydrate from the server response (keeps progress strip authoritative).
  async function mark(leadId, engagement) {
    const prev = campaign;
    const name = campaign.members.find((m) => m.id === leadId)?.name || "Lead";
    setCampaign((c) => ({
      ...c,
      members: c.members.map((m) => (m.id === leadId ? { ...m, engagement } : m)),
      messages: c.messages.map((m) => (m.leadId === leadId ? { ...m, engagement } : m)),
    }));
    setSavingLeadId(leadId);
    const fresh = await saveEngagement(campaign.id, { leadId, engagement });
    if (fresh) {
      setCampaign(fresh);
      toast(`${name} → ${statusMeta(engagement).label}`);
    } else {
      setCampaign(prev);
      toast("Couldn't save — reverted.", "error");
    }
    setSavingLeadId(null);
  }

  // Send/touch progress over the leads' engagement.
  const total = campaign.members.length;
  const counts = campaign.members.reduce((a, m) => {
    const e = m.engagement || "new"; a[e] = (a[e] || 0) + 1; return a;
  }, {});
  const touched = total - (counts.new || 0);
  const unsent = total - touched;

  async function setSequence(sequenceId) {
    setSavingSeq(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId: sequenceId || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't set cadence.");
      setCampaign(d.campaign);
      const name = sequences.find((s) => String(s.id) === String(sequenceId))?.name;
      toast(sequenceId ? `Cadence set: ${name}` : "Cadence removed.");
    } catch (e) { toast(e.message, "error"); } finally { setSavingSeq(false); }
  }

  function nextUnsent() {
    const first = campaign.messages.find((m) => !m.engagement || m.engagement === "new");
    if (!first) return toast("All leads contacted 🎉");
    document.getElementById(`lead-${first.leadId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (campaign.members.length === 0) {
    return (
      <EmptyState
        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        title="No leads in this campaign yet"
        hint="Add leads from your Leads hub — select the ones you want, then choose “Add to Campaign.”"
        action={<Link href="/leads" className="btn-primary">Go to Leads</Link>}
      />
    );
  }

  return (
    <div className="space-y-6">
      {mock && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Test mode.</span> Messages are AI-generated placeholders and Send actions are disabled until a live key is set.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Leads" value={total} tone="accent" />
        <KpiCard label="Contacted" value={touched} sub={`${unsent} to go`} tone="success" />
        <KpiCard label="Replied" value={(counts.replied || 0) + (counts.meeting || 0) + (counts.won || 0)} tone="warning" />
        <KpiCard label="Won" value={counts.won || 0} tone="success" />
      </div>

      {/* Send progress */}
      {hasMessages && (
        <div className="card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-ink">
              <span className="font-semibold">{touched} of {total}</span> contacted
              {counts.replied ? ` · ${counts.replied} replied` : ""}
              {counts.meeting ? ` · ${counts.meeting} meeting` : ""}
              {counts.won ? ` · ${counts.won} won` : ""}
            </span>
            {unsent > 0 && (
              <button type="button" onClick={nextUnsent} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-medium text-accent hover:bg-accent/5">
                ▶ Next unsent ({unsent} left)
              </button>
            )}
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#f3f3f0]">
            {LEAD_STATUSES.filter((s) => s.key !== "new" && counts[s.key]).map((s) => (
              <div key={s.key} className={s.dot} style={{ width: `${(counts[s.key] / total) * 100}%` }} title={`${counts[s.key]} ${s.label}`} />
            ))}
          </div>
        </div>
      )}

      {/* Generate step */}
      {!hasMessages && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink">Generate Messages</h3>
          <p className="mt-1 text-sm text-muted">Draft an email, WhatsApp message, and call script for each of the {campaign.members.length} leads.</p>
          <button type="button" onClick={() => setConfirmGen(true)} className="btn-primary mt-3">Generate Messages</button>
        </div>
      )}

      {/* Follow-up cadence — when set, contacting a lead schedules its steps in Today */}
      <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-sm font-medium text-ink">Follow-up cadence</span>
        <select
          className="input w-auto"
          value={campaign.sequenceId || ""}
          onChange={(e) => setSequence(e.target.value)}
          disabled={savingSeq}
          aria-label="Follow-up cadence"
        >
          <option value="">No cadence (single +3-day follow-up)</option>
          {sequences.map((s) => (
            <option key={s.id} value={s.id}>{s.name} · {s.steps.length} step{s.steps.length === 1 ? "" : "s"}</option>
          ))}
        </select>
        <a href="/sequences" className="text-xs font-medium text-accent hover:underline">Manage cadences →</a>
        {campaign.sequenceId ? (
          <span className="ml-auto text-xs text-muted">Steps auto-schedule into Today as you work each lead.</span>
        ) : null}
      </div>

      {/* Members + engagement — Board (drag across stages) or List */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Leads in this campaign ({campaign.members.length})</h3>
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-xs font-medium" role="tablist" aria-label="View leads as">
            {[["board", "Board"], ["list", "List"]].map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={view === k}
                onClick={() => switchView(k)}
                className={`rounded-md px-3 py-1 transition-colors ${view === k ? "bg-accent text-white" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {view === "board" ? (
          <PipelineBoard
            members={campaign.members}
            savingLeadId={savingLeadId}
            onMark={mark}
            onOpenLead={setOpenLead}
          />
        ) : (
          <div className="table-wrap">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="bg-[#f3f3f0] text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-4 py-2">Business</th><th className="px-4 py-2">Score</th><th className="px-4 py-2">Engagement</th>
              </tr></thead>
              <tbody>
                {campaign.members.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-0 even:bg-[#fafaf8]">
                    <td className="px-4 py-2">
                      <button type="button" onClick={() => setOpenLead(m)} className="text-left font-medium text-ink hover:text-accent hover:underline">{m.name}</button>
                    </td>
                    <td className="px-4 py-2"><ScoreBadge score={m.score} /></td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {!m.engagement || m.engagement === "new" ? (
                          <button
                            type="button"
                            onClick={() => mark(m.id, "contacted")}
                            disabled={savingLeadId === m.id}
                            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1647b8] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingLeadId === m.id ? "…" : "✓ Mark sent"}
                          </button>
                        ) : (
                          <StatusBadge status={m.engagement} kind="engagement" />
                        )}
                        <StatusSelect value={m.engagement || "new"} saving={savingLeadId === m.id} onChange={(next) => mark(m.id, next)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Messages review/send */}
      {hasMessages && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Messages — review &amp; send</h3>
            <button type="button" onClick={() => setConfirmGen(true)} className="btn-ghost px-3 py-1.5 text-xs">Regenerate</button>
          </div>
          <MessageTabs messages={campaign.messages} qualified={campaign.qualified} mock={mock} onMark={mark} savingLeadId={savingLeadId} />
        </section>
      )}

      {confirmGen && (
        <ConfirmActionModal
          title={`${hasMessages ? "Regenerate" : "Generate"} messages for ${campaign.members.length} leads?`}
          body="Drafts email + WhatsApp + call script per lead and uses AI credits."
          confirmLabel={hasMessages ? "Regenerate" : "Generate Messages"} busy={busy}
          onConfirm={generate} onClose={() => !busy && setConfirmGen(false)}
        />
      )}
      {meetingLead && <MeetingModal domain={campaign.module === "international" ? "international" : "local"} lead={meetingLead} onClose={() => setMeetingLead(null)} />}
      {openLead && (
        <LeadDetailDrawer
          lead={openLead}
          mock={mock}
          onClose={() => setOpenLead(null)}
          onChanged={() => { setOpenLead(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
