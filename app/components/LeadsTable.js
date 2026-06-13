"use client";

import { useState } from "react";
import ScoreBadge from "./ScoreBadge";
import StatusSelect from "./StatusSelect";
import LeadDrawer from "./LeadDrawer";
import MeetingModal from "./MeetingModal";
import { LEAD_STATUSES, DEFAULT_STATUS, statusMeta } from "./status";
import { toast } from "./toast";
import { saveOutcome } from "./outcomes";

export default function LeadsTable({
  leads,
  campaignId,
  initialOutcomes,
  qualified,
  messages,
  domain,
  campaignCreatedAt,
  mock,
}) {
  const [outcomes, setOutcomes] = useState(initialOutcomes || {});
  const [savingName, setSavingName] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [prepData, setPrepData] = useState(null);

  // Table controls
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState(null); // "name" | "score"
  const [sortDir, setSortDir] = useState("asc");
  const [picked, setPicked] = useState(() => new Set());

  if (!leads || leads.length === 0) return null;

  const cardByName = {};
  (qualified || []).forEach((c) => c?.name && (cardByName[c.name.trim().toLowerCase()] = c));
  const msgByName = {};
  (messages || []).forEach((m) => m?.name && (msgByName[m.name.trim().toLowerCase()] = m));

  async function updateStatus(leadName, status) {
    const prev = outcomes[leadName]?.status || DEFAULT_STATUS;
    setOutcomes((o) => ({ ...o, [leadName]: { ...o[leadName], status } }));
    setSavingName(leadName);
    if (await saveOutcome(campaignId, { leadName, status })) {
      toast(`${leadName} → ${statusMeta(status).label}`);
    } else {
      setOutcomes((o) => ({ ...o, [leadName]: { ...o[leadName], status: prev } }));
      toast("Couldn't save status — reverted.", "error");
    }
    setSavingName(null);
  }

  async function saveNotes(leadName, notes) {
    const prev = outcomes[leadName]?.notes || "";
    setOutcomes((o) => ({ ...o, [leadName]: { ...o[leadName], notes } }));
    if (await saveOutcome(campaignId, { leadName, notes })) {
      toast("Notes saved.");
    } else {
      setOutcomes((o) => ({ ...o, [leadName]: { ...o[leadName], notes: prev } }));
      toast("Couldn't save notes.", "error");
    }
  }

  async function bulkSetStatus(status) {
    const names = [...picked];
    if (names.length === 0) return;
    setOutcomes((o) => {
      const next = { ...o };
      names.forEach((n) => (next[n] = { ...next[n], status }));
      return next;
    });
    const results = await Promise.all(
      names.map((n) => saveOutcome(campaignId, { leadName: n, status }))
    );
    if (results.every(Boolean)) {
      toast(`${names.length} lead${names.length > 1 ? "s" : ""} → ${statusMeta(status).label}`);
    } else {
      toast("Some updates failed — reload to confirm.", "error");
    }
  }

  function toggleRow(name) {
    setPicked((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }
  function toggleSort(key) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "score" ? "desc" : "asc");
    }
  }

  // Filter → sort
  let view = leads.filter((l) => {
    const st = outcomes[l.name]?.status || DEFAULT_STATUS;
    if (statusFilter !== "all" && st !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      return [l.name, l.category, l.gap, l.source].some((x) => (x || "").toLowerCase().includes(q));
    }
    return true;
  });
  if (sortBy) {
    view = [...view].sort((a, b) => {
      let r = 0;
      if (sortBy === "name") r = (a.name || "").localeCompare(b.name || "");
      else if (sortBy === "score") r = (Number(a.score) || 0) - (Number(b.score) || 0);
      return sortDir === "asc" ? r : -r;
    });
  }

  const allSelected = view.length > 0 && view.every((l) => picked.has(l.name));
  function toggleAll() {
    setPicked(allSelected ? new Set() : new Set(view.map((l) => l.name)));
  }

  function exportCSV(rows) {
    const header = ["Business", "Category", "Website", "Gap", "Source", "Score", "Priority", "Status", "Decision Maker", "WhatsApp", "Email"];
    const data = rows.map((l) => {
      const card = cardByName[(l.name || "").trim().toLowerCase()] || {};
      return [
        l.name, l.category, l.website, l.gap, l.source, l.score, l.priority,
        outcomes[l.name]?.status || DEFAULT_STATUS, card.decisionMaker, card.whatsapp, card.email,
      ];
    });
    const csv = [header, ...data].map((r) => r.map(csvCell).join(",")).join("\n");
    downloadCSV(`leads-campaign-${campaignId}.csv`, csv);
    toast(`Exported ${rows.length} lead${rows.length > 1 ? "s" : ""} to CSV.`);
  }

  const counts = {};
  for (const l of leads) {
    const s = outcomes[l.name]?.status || DEFAULT_STATUS;
    counts[s] = (counts[s] || 0) + 1;
  }
  const summary = LEAD_STATUSES.filter((s) => s.key !== "new" && counts[s.key]);

  const selOutcome = selectedLead ? outcomes[selectedLead.name] || {} : {};
  const selKey = selectedLead ? (selectedLead.name || "").trim().toLowerCase() : "";

  // Split into businesses you added vs AI-found leads (only shown when both exist).
  const isManual = (l) => /added manually/i.test(l.source || "");
  const manual = view.filter(isManual);
  const aiFound = view.filter((l) => !isManual(l));
  const split = manual.length > 0 && aiFound.length > 0;

  const renderRow = (l) => (
    <tr
      key={l.name}
      className={`border-b border-line align-middle transition-colors duration-150 last:border-0 hover:bg-[#fafaf8] ${rowTone(
        l.score
      )}`}
    >
      <td className="px-4 py-3">
        <input type="checkbox" checked={picked.has(l.name)} onChange={() => toggleRow(l.name)} aria-label={`Select ${l.name}`} />
      </td>
      <td className="px-4 py-3">
        <button type="button" onClick={() => setSelectedLead(l)} className="text-left font-medium text-ink hover:text-accent hover:underline">
          {l.name}
        </button>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted">{l.category}</td>
      <td className="px-4 py-3 text-muted">
        {l.website && l.website !== "none" ? (
          <span className="block max-w-[12rem] truncate">{l.website}</span>
        ) : (
          <span className="text-warning">none</span>
        )}
      </td>
      <td className="px-4 py-3 text-muted">
        <span className="line-clamp-2 max-w-[18rem]">{l.gap}</span>
      </td>
      <td className="px-4 py-3 text-muted">
        <span className="line-clamp-2 max-w-[12rem]">{l.source}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-3"><ScoreBadge score={l.score} /></td>
      <td className="whitespace-nowrap px-4 py-3">
        <StatusSelect
          value={outcomes[l.name]?.status || DEFAULT_STATUS}
          saving={savingName === l.name}
          onChange={(status) => updateStatus(l.name, status)}
        />
      </td>
    </tr>
  );

  const groupRow = (label, n) => (
    <tr key={`grp-${label}`}>
      <td colSpan={8} className="border-b border-line bg-[#f7f7f4] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label} ({n})
      </td>
    </tr>
  );

  return (
    <div className="space-y-3">
      {summary.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {summary.map((s) => (
            <span key={s.key} className={`badge ${s.cls}`}>
              {counts[s.key]} {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search leads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="input w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <span className="text-xs text-muted">{view.length} of {leads.length}</span>
        <button className="btn-ghost ml-auto px-3 py-1.5 text-xs" onClick={() => exportCSV(view)}>
          Export CSV
        </button>
      </div>

      {/* Bulk action bar */}
      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-accent/30 bg-accent/5 px-4 py-2">
          <span className="text-sm font-medium text-ink">{picked.size} selected</span>
          <select
            className="input w-auto py-1 text-xs"
            value=""
            onChange={(e) => { if (e.target.value) bulkSetStatus(e.target.value); }}
            aria-label="Set status for selected"
          >
            <option value="">Set status…</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <button
            className="btn-ghost px-3 py-1 text-xs"
            onClick={() => exportCSV(view.filter((l) => picked.has(l.name)))}
          >
            Export selected
          </button>
          <button className="text-xs font-medium text-muted hover:text-ink" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium text-muted">
              <th className="px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="cursor-pointer px-4 py-3 hover:text-ink" onClick={() => toggleSort("name")}>
                Business{sortIndicator(sortBy, sortDir, "name")}
              </th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Website</th>
              <th className="px-4 py-3">Gap</th>
              <th className="px-4 py-3">Source</th>
              <th className="cursor-pointer px-4 py-3 hover:text-ink" onClick={() => toggleSort("score")}>
                Score{sortIndicator(sortBy, sortDir, "score")}
              </th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                  No leads match your filters.
                </td>
              </tr>
            )}
            {split ? (
              <>
                {groupRow("Businesses you added", manual.length)}
                {manual.map(renderRow)}
                {groupRow("AI-found leads", aiFound.length)}
                {aiFound.map(renderRow)}
              </>
            ) : (
              view.map(renderRow)
            )}
          </tbody>
        </table>
      </div>

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          card={cardByName[selKey]}
          message={msgByName[selKey]}
          domain={domain}
          status={selOutcome.status || DEFAULT_STATUS}
          notes={selOutcome.notes || ""}
          updatedAt={selOutcome.updatedAt}
          createdAt={campaignCreatedAt}
          mock={mock}
          onStatusChange={(s) => updateStatus(selectedLead.name, s)}
          onSaveNotes={(n) => saveNotes(selectedLead.name, n)}
          onPrep={() => setPrepData(cardByName[selKey] || selectedLead)}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {prepData && (
        <MeetingModal
          domain={domain}
          lead={prepData}
          onClose={() => setPrepData(null)}
        />
      )}
    </div>
  );
}

function sortIndicator(sortBy, sortDir, key) {
  if (sortBy !== key) return " ↕";
  return sortDir === "asc" ? " ↑" : " ↓";
}

// Visual emphasis for high-opportunity leads: HOT (≥9) red strip, HIGH (≥7) amber.
function rowTone(score) {
  const n = Number(score) || 0;
  if (n >= 9) return "border-l-2 border-l-danger bg-red-50/40";
  if (n >= 7) return "border-l-2 border-l-warning bg-amber-50/40";
  return "";
}

// CSV helpers
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
