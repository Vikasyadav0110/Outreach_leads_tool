"use client";

import { useState } from "react";
import GlobalLeadsTable from "./GlobalLeadsTable";
import { DomainChip } from "./Brand";
import { LEAD_STATUSES, DEFAULT_STATUS } from "./status";

// Group every lead by the niche it was searched under → one card per category.
function buildCategories(leads) {
  const map = new Map();
  for (const l of leads) {
    const key = (l.niche || "—").trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { key, title: (l.niche || "Uncategorized").trim(), leads: [] });
    }
    map.get(key).leads.push(l);
  }
  const cats = [...map.values()].map((c) => {
    const counts = {};
    for (const l of c.leads) {
      const s = l.status || DEFAULT_STATUS;
      counts[s] = (counts[s] || 0) + 1;
    }
    return {
      ...c,
      total: c.leads.length,
      unique: new Set(c.leads.map((l) => l.name)).size,
      high: c.leads.filter((l) => (Number(l.score) || 0) >= 7).length,
      domains: [...new Set(c.leads.map((l) => l.domain))],
      counts,
    };
  });
  cats.sort((a, b) => b.total - a.total);
  return cats;
}

export default function Categories({ leads, mock }) {
  const [selected, setSelected] = useState(null); // niche key

  if (!leads || leads.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-muted">
        No leads yet. Run a campaign and its leads will appear here, grouped by category.
      </div>
    );
  }

  const cats = buildCategories(leads);

  if (selected) {
    const cat = cats.find((c) => c.key === selected);
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-sm text-muted hover:text-ink"
        >
          ← All categories
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="h-display text-lg text-ink">{cat?.title}</h2>
          <span className="text-sm text-muted">{cat?.total} leads</span>
        </div>
        <GlobalLeadsTable leads={cat?.leads || []} mock={mock} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cats.map((c) => {
        const rollup = LEAD_STATUSES.filter((s) => s.key !== "new" && c.counts[s.key]);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => setSelected(c.key)}
            className="card card-hover p-5 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">{c.title}</h3>
              <div className="flex flex-wrap justify-end gap-1">
                {c.domains.map((d) => (
                  <DomainChip key={d} domain={d} />
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-end gap-4">
              <div>
                <div className="text-2xl font-bold tracking-tight text-ink">{c.total}</div>
                <div className="text-xs text-muted">leads</div>
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight text-warning">{c.high}</div>
                <div className="text-xs text-muted">HIGH</div>
              </div>
              {c.unique !== c.total && (
                <div>
                  <div className="text-2xl font-bold tracking-tight text-muted">{c.unique}</div>
                  <div className="text-xs text-muted">unique</div>
                </div>
              )}
            </div>

            <div className="mt-3 flex min-h-[1.25rem] flex-wrap items-center gap-1.5">
              {rollup.length > 0 ? (
                rollup.map((s) => (
                  <span key={s.key} className="flex items-center gap-1 text-xs text-muted" title={s.label}>
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    {c.counts[s.key]} {s.label}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted">No outreach logged yet</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
