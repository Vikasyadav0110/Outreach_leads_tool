"use client";

import { useMemo, useState } from "react";
import Categories from "./Categories";
import GlobalLeadsTable from "./GlobalLeadsTable";
import { LayersIcon } from "./icons";
import { KpiCard, ChartCard, DonutChart, HBarChart } from "./charts";
import { STATUS_COLORS, CHART } from "./chartColors";
import { LEAD_STATUSES, DEFAULT_STATUS } from "./status";

function RowsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <rect x="3" y="13" width="18" height="5" rx="1" />
    </svg>
  );
}

const TABS = [
  { key: "category", label: "By category", icon: LayersIcon },
  { key: "all", label: "All leads", icon: RowsIcon },
];

export default function LeadsManager({ leads, mock }) {
  const [view, setView] = useState("category");

  const stats = useMemo(() => {
    const total = leads.length;
    const high = leads.filter((l) => (Number(l.score) || 0) >= 7).length;
    const scored = leads.filter((l) => Number(l.score) > 0);
    const avg = scored.length
      ? (scored.reduce((n, l) => n + Number(l.score), 0) / scored.length).toFixed(1)
      : "—";
    const tracked = leads.filter((l) => (l.status || DEFAULT_STATUS) !== "new").length;
    const counts = {};
    for (const l of leads) {
      const s = l.status || DEFAULT_STATUS;
      counts[s] = (counts[s] || 0) + 1;
    }
    const statusData = LEAD_STATUSES.map((s) => ({
      name: s.label,
      value: counts[s.key] || 0,
      color: STATUS_COLORS[s.key],
    }));
    const nicheMap = new Map();
    for (const l of leads) {
      const k = (l.niche || "—").trim() || "—";
      nicheMap.set(k, (nicheMap.get(k) || 0) + 1);
    }
    const nicheData = [...nicheMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return { total, high, avg, tracked, statusData, nicheData };
  }, [leads]);

  return (
    <div className="space-y-5">
      {leads.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <KpiCard label="Total leads" value={stats.total} tone="accent" />
            <KpiCard label="HIGH (≥7)" value={stats.high} tone="warning" />
            <KpiCard label="Avg score" value={stats.avg} />
            <KpiCard label="Tracked" value={stats.tracked} tone="success" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Status mix">
              <DonutChart data={stats.statusData} />
            </ChartCard>
            <ChartCard title="Top niches by leads">
              <HBarChart data={stats.nicheData} color={CHART.accent2} />
            </ChartCard>
          </div>
        </div>
      )}

      <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = view === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-accent/10 text-accent" : "text-muted hover:text-ink"
              }`}
            >
              <Icon width="15" height="15" />
              {t.label}
            </button>
          );
        })}
      </div>

      {view === "category" ? (
        <Categories leads={leads} mock={mock} />
      ) : (
        <GlobalLeadsTable leads={leads} mock={mock} />
      )}
    </div>
  );
}
