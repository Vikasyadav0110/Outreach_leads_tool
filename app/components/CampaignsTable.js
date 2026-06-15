"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DomainChip } from "./Brand";
import EmptyState from "./EmptyState";
import { LEAD_STATUSES } from "./status";
import { toast } from "./toast";
import { fmtDate } from "./format";
import { TrashIcon } from "./icons";

const STATUS_LABEL = {
  new: "New",
  finding: "Finding leads…",
  found: "Leads found",
  qualifying: "Qualifying…",
  qualified: "Qualified",
  writing: "Writing…",
  ready: "Ready",
  failed: "Failed",
};

function StatusPill({ status, hasData }) {
  const ready = status === "ready";
  const running = ["finding", "qualifying", "writing"].includes(status);
  const failed = status === "failed";
  const partial = failed && hasData; // errored, but some leads were produced
  let cls = "bg-neutral-100 text-muted";
  if (ready) cls = "bg-green-50 text-success";
  else if (running) cls = "bg-blue-50 text-accent";
  else if (partial) cls = "bg-amber-50 text-warning";
  else if (failed) cls = "bg-red-50 text-danger";
  return (
    <span className={`badge gap-1 ${cls}`}>
      {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {partial ? "Partial" : STATUS_LABEL[status] || status}
    </span>
  );
}

// Compact per-campaign outcome rollup: colored dots with counts (skips "new").
function OutcomeRollup({ counts }) {
  const shown = LEAD_STATUSES.filter((s) => s.key !== "new" && counts?.[s.key]);
  if (shown.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((s) => (
        <span key={s.key} className="flex items-center gap-1 text-xs text-muted" title={s.label}>
          <span className={`h-2 w-2 rounded-full ${s.dot}`} />
          {counts[s.key]}
        </span>
      ))}
    </div>
  );
}

const ChartGlyph = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3v18h18" />
    <path d="m7 14 4-4 3 3 5-6" />
  </svg>
);

export default function CampaignsTable({ campaigns }) {
  const router = useRouter();

  if (!campaigns || campaigns.length === 0) {
    return (
      <EmptyState
        icon={ChartGlyph}
        title="No campaigns yet"
        hint="Create a campaign — pick a domain, city, and niche, and run the pipeline end to end."
        action={
          <Link href="/campaigns/new" className="btn-primary">
            New campaign
          </Link>
        }
      />
    );
  }

  function go(id) {
    router.push(`/campaign/${id}`);
  }

  async function del(e, c) {
    e.stopPropagation();
    if (!window.confirm(`Delete the "${c.niche} · ${c.city}" campaign? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Campaign deleted.");
      router.refresh();
    } catch {
      toast("Couldn't delete campaign.", "error");
    }
  }

  return (
    <div className="table-wrap">
      <table className="data-table min-w-[760px]">
        <thead>
          <tr>
            <th>Date</th>
            <th>Domain</th>
            <th>City</th>
            <th>Niche</th>
            <th>Leads</th>
            <th>Pipeline</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr
              key={c.id}
              role="link"
              tabIndex={0}
              onClick={() => go(c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  go(c.id);
                }
              }}
              className="cursor-pointer transition-colors duration-150 focus-visible:bg-[#eef1f8]"
            >
              <td className="px-4 py-3 text-muted">
                {fmtDate(c.createdAt)}
              </td>
              <td className="px-4 py-3">
                <DomainChip domain={c.domain} />
              </td>
              <td className="px-4 py-3 text-ink">{c.city}</td>
              <td className="px-4 py-3 text-ink">{c.niche}</td>
              <td className="px-4 py-3 text-muted">{c.leadsFound || "—"}</td>
              <td className="px-4 py-3">
                <OutcomeRollup counts={c.outcomeCounts} />
              </td>
              <td className="px-4 py-3">
                <StatusPill status={c.status} hasData={(c.leadsFound || 0) > 0} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <span className="inline-flex items-center gap-1 font-medium text-accent">
                    View
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => del(e, c)}
                    aria-label={`Delete ${c.niche} ${c.city} campaign`}
                    title="Delete campaign"
                    className="rounded-md p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-danger"
                  >
                    <TrashIcon width="15" height="15" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
