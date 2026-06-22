"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ScoreBadge from "./ScoreBadge";
import StatusBadge from "./StatusBadge";
import ConfirmActionModal from "./ConfirmActionModal";
import LeadDetailDrawer from "./LeadDetailDrawer";
import EmptyState from "./EmptyState";
import { DomainChip } from "./Brand";
import { LEAD_LIFECYCLE } from "./status";
import { toCSV, downloadCSV } from "./csv";
import { fmtDate, fmtAge } from "./format";
import { toast } from "./toast";

// The data hub: every lead ever found, independent of campaigns. Find / Qualify /
// Add-to-Campaign happen here. No AI step runs without an explicit confirm.
export default function LeadsHub({ leads, campaigns, mock = false }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [picked, setPicked] = useState(() => new Set());
  const [findOpen, setFindOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // {title,body,confirmLabel,onConfirm,tone}
  const [busy, setBusy] = useState(false);
  const [openLead, setOpenLead] = useState(null);

  const view = useMemo(() => {
    return leads.filter((l) => {
      if (status !== "all" && l.status !== status) return false;
      if (q) {
        const s = q.toLowerCase();
        return [l.name, l.city, l.niche].some((x) => (x || "").toLowerCase().includes(s));
      }
      return true;
    });
  }, [leads, q, status]);

  const allSel = view.length > 0 && view.every((l) => picked.has(l.id));
  const toggleAll = () => setPicked(allSel ? new Set() : new Set(view.map((l) => l.id)));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = () => view.filter((l) => picked.has(l.id));

  async function qualifySelected() {
    const ids = chosen().map((l) => l.id);
    setConfirm({
      title: `Qualify ${ids.length} lead${ids.length > 1 ? "s" : ""}?`,
      body: "AI will research each selected lead's contact + the best pitch. Uses AI credits. Other leads are untouched.",
      confirmLabel: "Qualify & Score",
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/leads/qualify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadIds: ids }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || "Qualify failed.");
          toast(`Qualified ${d.qualified} lead${d.qualified > 1 ? "s" : ""}.`);
          setPicked(new Set()); setConfirm(null); router.refresh();
        } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
      },
    });
  }

  function exportSelected() {
    const rows = (chosen().length ? chosen() : view).map((l) => [
      l.name, l.city, l.niche, l.score, l.status, l.card?.decisionMaker || "", l.card?.email || "", l.card?.whatsapp || "",
    ]);
    downloadCSV(`leads-${Date.now()}.csv`, toCSV(["Business", "City", "Niche", "Score", "Status", "Decision Maker", "Email", "WhatsApp"], rows));
    toast(`Exported ${rows.length} lead${rows.length > 1 ? "s" : ""}.`);
  }

  const empty = leads.length === 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search business, city, niche…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {LEAD_LIFECYCLE.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {!empty && <span className="text-xs text-muted">{view.length} of {leads.length}</span>}
        <button type="button" onClick={() => setFindOpen(true)} className="btn-primary ml-auto px-4 py-2 text-sm">+ Find New Leads</button>
      </div>

      {empty ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>}
          title="No leads yet"
          hint="1. Find leads  →  2. Qualify & Score  →  3. Add to a Campaign. Start by finding leads for a niche + city."
          action={<button type="button" onClick={() => setFindOpen(true)} className="btn-primary">+ Find New Leads</button>}
        />
      ) : (
        <>
          {/* Bulk bar */}
          {picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
              <span className="text-sm text-ink">{picked.size} selected</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button type="button" onClick={qualifySelected} disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-[#1647b8] disabled:opacity-50">Qualify &amp; Score</button>
                <button type="button" onClick={() => setConfirm({ addToCampaign: true })} disabled={busy} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-medium text-ink hover:bg-[#f3f3f0] disabled:opacity-50">Add to Campaign</button>
                <button type="button" onClick={exportSelected} disabled={busy} className="rounded-md border border-line bg-white px-3 py-1 text-xs font-medium text-ink hover:bg-[#f3f3f0] disabled:opacity-50">Export CSV</button>
                <button type="button" onClick={() => setPicked(new Set())} className="rounded-md px-2 py-1 text-xs text-muted hover:text-ink">Clear</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-[#f3f3f0] text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-3 py-3"><input type="checkbox" checked={allSel} onChange={toggleAll} className="h-4 w-4 accent-[#1c5bd6]" aria-label="Select all" /></th>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Niche</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">In campaigns</th>
                  <th className="px-4 py-3">Found</th>
                </tr>
              </thead>
              <tbody>
                {view.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">No leads match your filters.</td></tr>
                ) : view.map((l) => (
                  <tr key={l.id} className={`border-b border-line last:border-0 hover:bg-[#eef1f8] ${picked.has(l.id) ? "bg-accent/5" : "even:bg-[#fafaf8]"}`}>
                    <td className="px-3 py-3"><input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} className="h-4 w-4 accent-[#1c5bd6]" aria-label={`Select ${l.name}`} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setOpenLead(l)} className="text-left font-medium text-ink hover:text-accent hover:underline">{l.name}</button>
                        {l.domain && <span className="text-xs text-muted"><DomainChip domain={l.domain} /></span>}
                        {l.suppressed && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-danger">DNC</span>}
                      </div>
                      {l.source && <div className="mt-0.5 truncate text-[11px] text-muted">via {l.source}{l.createdAt ? ` · ${fmtAge(l.createdAt)}` : ""}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{l.city || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{l.niche || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3"><ScoreBadge score={l.score} /></td>
                    <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted tabular-nums">{l.campaignCount || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{fmtDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {findOpen && <FindModal onClose={() => setFindOpen(false)} onDone={() => { setFindOpen(false); router.refresh(); }} />}

      {confirm?.addToCampaign && (
        <AddToCampaignModal
          count={picked.size}
          campaigns={campaigns}
          onClose={() => setConfirm(null)}
          onDone={() => { setPicked(new Set()); setConfirm(null); router.refresh(); }}
          leadIds={chosen().map((l) => l.id)}
        />
      )}
      {confirm && !confirm.addToCampaign && (
        <ConfirmActionModal {...confirm} busy={busy} onClose={() => !busy && setConfirm(null)} />
      )}

      {openLead && (
        <LeadDetailDrawer
          lead={openLead}
          mock={mock}
          onClose={() => setOpenLead(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function FindModal({ onClose, onDone }) {
  const [city, setCity] = useState("");
  const [niche, setNiche] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!city.trim() || !niche.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/leads/find", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, niche }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Find failed.");
      if (!d.found && !d.added && !d.updated) {
        toast(`No businesses found for “${niche.trim()}” in ${city.trim()} — try a broader niche or another city.`);
      } else {
        toast(`Found ${d.found} · ${d.added} new, ${d.updated} updated.`);
      }
      onDone();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }
  if (typeof document === "undefined") return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-sm rounded-card border border-line bg-canvas p-5 shadow-pop">
        <h3 className="text-base font-semibold text-ink">Find new leads</h3>
        <p className="mt-1 text-xs text-muted">AI searches the web for real businesses. They land here as “new” — qualifying is a separate step.</p>
        <div className="mt-4 space-y-3">
          <div><label className="label">Niche</label><input className="input" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. dentists, yoga studios" /></div>
          <div><label className="label">City</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" /></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
          <button type="button" onClick={run} disabled={busy || !city.trim() || !niche.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
            {busy ? "Searching…" : "Find Leads"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddToCampaignModal({ count, campaigns, leadIds, onClose, onDone }) {
  const [mode, setMode] = useState(campaigns.length ? "existing" : "new");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      let cid = campaignId;
      if (mode === "new") {
        const res = await fetch("/api/campaigns", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() || "New campaign" }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Could not create campaign.");
        cid = d.campaign.id;
      }
      const res2 = await fetch(`/api/campaigns/${cid}/leads`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });
      const d2 = await res2.json();
      if (!res2.ok) throw new Error(d2.error || "Could not add leads.");
      toast(`Added ${d2.added} lead${d2.added > 1 ? "s" : ""} to the campaign.`);
      onDone();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-sm rounded-card border border-line bg-canvas p-5 shadow-pop">
        <h3 className="text-base font-semibold text-ink">Add {count} lead{count > 1 ? "s" : ""} to a campaign</h3>
        <div className="mt-4 space-y-3">
          {campaigns.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Existing campaign
            </label>
          )}
          {mode === "existing" && campaigns.length > 0 && (
            <select className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.leadCount})</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> New campaign
          </label>
          {mode === "new" && <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name (e.g. Pune dentists · Email)" />}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
          <button type="button" onClick={go} disabled={busy} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{busy ? "Adding…" : "Add to Campaign"}</button>
        </div>
      </div>
    </div>
  );
}
