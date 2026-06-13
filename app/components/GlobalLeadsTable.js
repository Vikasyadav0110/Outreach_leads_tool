"use client";

import { useState } from "react";
import Link from "next/link";
import ScoreBadge from "./ScoreBadge";
import StatusSelect from "./StatusSelect";
import LeadDrawer from "./LeadDrawer";
import MeetingModal from "./MeetingModal";
import { DomainChip, DOMAIN_ORDER } from "./Brand";
import { LEAD_STATUSES, statusMeta, DEFAULT_STATUS } from "./status";
import { toast } from "./toast";
import { saveOutcome } from "./outcomes";

const keyOf = (l) => `${l.campaignId}::${l.name}`;

export default function GlobalLeadsTable({ leads, mock }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [domain, setDomain] = useState("all");
  const [groupBy, setGroupBy] = useState("campaign");
  const [sortBy, setSortBy] = useState("score");
  const [dir, setDir] = useState("desc");
  const [statuses, setStatuses] = useState(() => {
    const m = {};
    (leads || []).forEach((l) => (m[keyOf(l)] = l.status || DEFAULT_STATUS));
    return m;
  });
  const [savingKey, setSavingKey] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [prepData, setPrepData] = useState(null);

  if (!leads || leads.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-muted">
        No leads yet. Run a campaign to populate this view.
      </div>
    );
  }

  async function updateStatus(l, next) {
    const k = keyOf(l);
    const prev = statuses[k] || DEFAULT_STATUS;
    setStatuses((s) => ({ ...s, [k]: next }));
    setSavingKey(k);
    if (await saveOutcome(l.campaignId, { leadName: l.name, status: next })) {
      toast(`${l.name} → ${statusMeta(next).label}`);
    } else {
      setStatuses((s) => ({ ...s, [k]: prev }));
      toast("Couldn't save status — reverted.", "error");
    }
    setSavingKey(null);
  }

  async function saveNotes(l, notes) {
    if (await saveOutcome(l.campaignId, { leadName: l.name, notes })) toast("Notes saved.");
    else toast("Couldn't save notes.", "error");
  }

  const domains = [...new Set(leads.map((l) => l.domain))];

  let view = leads.filter((l) => {
    if (status !== "all" && (statuses[keyOf(l)] || DEFAULT_STATUS) !== status) return false;
    if (domain !== "all" && l.domain !== domain) return false;
    if (q) {
      const s = q.toLowerCase();
      return [l.name, l.category, l.campaignLabel].some((x) => (x || "").toLowerCase().includes(s));
    }
    return true;
  });
  view = [...view].sort((a, b) => {
    let r = 0;
    if (sortBy === "score") r = (Number(a.score) || 0) - (Number(b.score) || 0);
    else if (sortBy === "name") r = (a.name || "").localeCompare(b.name || "");
    return dir === "asc" ? r : -r;
  });

  function toggleSort(k) {
    if (sortBy === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(k);
      setDir(k === "score" ? "desc" : "asc");
    }
  }
  const ind = (k) => (sortBy !== k ? " ↕" : dir === "asc" ? " ↑" : " ↓");

  // Build ordered groups for the chosen grouping.
  function buildGroups(rows) {
    if (groupBy === "none") return [{ key: "all", header: null, rows }];
    const map = new Map();
    for (const l of rows) {
      const key = groupBy === "campaign" ? l.campaignId : l.domain;
      if (!map.has(key)) {
        map.set(key, {
          key,
          header: groupBy === "campaign" ? l.campaignLabel : <DomainChip domain={l.domain} />,
          rows: [],
        });
      }
      map.get(key).rows.push(l);
    }
    const groups = [...map.values()];
    if (groupBy === "domain") {
      groups.sort((a, b) => DOMAIN_ORDER.indexOf(a.key) - DOMAIN_ORDER.indexOf(b.key));
    } else {
      groups.sort((a, b) => b.key - a.key); // recent campaigns first
    }
    return groups;
  }
  const groups = buildGroups(view);

  const renderRow = (l) => {
    const k = keyOf(l);
    return (
      <tr key={k} className="border-b border-line align-middle transition-colors duration-150 even:bg-[#fafaf8] last:border-0 hover:bg-[#eef1f8]">
        <td className="px-4 py-3">
          <button type="button" onClick={() => setSelectedLead(l)} className="text-left font-medium text-ink hover:text-accent hover:underline">
            {l.name}
          </button>
          {l.category && <div className="text-xs text-muted">{l.category}</div>}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <Link href={`/campaign/${l.campaignId}`} className="text-muted hover:text-accent hover:underline">
            {l.campaignLabel}
          </Link>
        </td>
        <td className="whitespace-nowrap px-4 py-3"><DomainChip domain={l.domain} /></td>
        <td className="whitespace-nowrap px-4 py-3"><ScoreBadge score={l.score} /></td>
        <td className="whitespace-nowrap px-4 py-3">
          <StatusSelect value={statuses[k] || DEFAULT_STATUS} saving={savingKey === k} onChange={(next) => updateStatus(l, next)} />
        </td>
      </tr>
    );
  };

  const renderTable = (rows) => (
    <div className="table-wrap">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-muted">
            <th className="cursor-pointer px-4 py-3 hover:text-ink" onClick={() => toggleSort("name")}>Business{ind("name")}</th>
            <th className="px-4 py-3">Campaign</th>
            <th className="px-4 py-3">Domain</th>
            <th className="cursor-pointer px-4 py-3 hover:text-ink" onClick={() => toggleSort("score")}>Score{ind("score")}</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">No leads match your filters.</td></tr>
          ) : (
            rows.map(renderRow)
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search leads or campaigns…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select className="input w-auto" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Filter by domain">
          <option value="all">All domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select className="input w-auto" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} aria-label="Group by">
          <option value="none">No grouping</option>
          <option value="campaign">Group by campaign</option>
          <option value="domain">Group by domain</option>
        </select>
        <span className="text-xs text-muted">{view.length} of {leads.length}</span>
      </div>

      {groupBy === "none" ? (
        renderTable(view)
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-ink">{g.header}</h3>
                <span className="text-xs text-muted">{g.rows.length}</span>
              </div>
              {renderTable(g.rows)}
            </div>
          ))}
        </div>
      )}

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          card={selectedLead.card}
          message={selectedLead.message}
          domain={selectedLead.domain}
          status={statuses[keyOf(selectedLead)] || DEFAULT_STATUS}
          notes={selectedLead.notes || ""}
          updatedAt={selectedLead.updatedAt}
          createdAt={selectedLead.campaignCreatedAt}
          mock={mock}
          onStatusChange={(s) => updateStatus(selectedLead, s)}
          onSaveNotes={(n) => saveNotes(selectedLead, n)}
          onPrep={() => setPrepData(selectedLead.card || selectedLead)}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {prepData && (
        <MeetingModal domain={selectedLead?.domain} lead={prepData} onClose={() => setPrepData(null)} />
      )}
    </div>
  );
}
