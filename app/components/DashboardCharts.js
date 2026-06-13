"use client";

import { useState } from "react";
import { DOMAIN_META, DomainChip, DOMAIN_ORDER } from "./Brand";

// `data` rows: { domain, leads, qualified, messaged, outcomes: {status: n} }
export default function DashboardCharts({ data }) {
  const [domain, setDomain] = useState("all");

  const rows = domain === "all" ? data : data.filter((d) => d.domain === domain);

  const sum = (fn) => rows.reduce((n, d) => n + (fn(d) || 0), 0);
  const oc = (k) => sum((d) => d.outcomes?.[k] || 0);

  const won = oc("won");
  const meeting = oc("meeting");
  const replied = oc("replied");
  const contacted = oc("contacted");

  // Cumulative outreach funnel.
  const funnel = [
    { label: "Leads found", value: sum((d) => d.leads) },
    { label: "Qualified", value: sum((d) => d.qualified) },
    { label: "Messaged", value: sum((d) => d.messaged) },
    { label: "Contacted", value: contacted + replied + meeting + won },
    { label: "Replied", value: replied + meeting + won },
    { label: "Won", value: won },
  ];
  const funnelMax = Math.max(1, funnel[0].value);

  // Leads by domain (always across all data, ignores the filter).
  const byDomain = DOMAIN_ORDER.map((key) => ({
    key,
    leads: data.filter((d) => d.domain === key).reduce((n, d) => n + (d.leads || 0), 0),
  })).filter((d) => d.leads > 0);
  const domainMax = Math.max(1, ...byDomain.map((d) => d.leads));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Funnel */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Outreach funnel</h3>
          <select
            className="input w-auto py-1 text-xs"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            aria-label="Filter funnel by domain"
          >
            <option value="all">All domains</option>
            {DOMAIN_ORDER.map((k) => (
              <option key={k} value={k}>{DOMAIN_META[k].label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2.5">
          {funnel.map((s) => {
            const pct = Math.round((s.value / funnelMax) * 100);
            const ofTop = funnelMax ? Math.round((s.value / funnelMax) * 100) : 0;
            return (
              <div key={s.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-ink">{s.label}</span>
                  <span className="text-muted">{s.value}{s.label !== "Leads found" && ` · ${ofTop}%`}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-all duration-500"
                    style={{ width: `${Math.max(pct, s.value > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leads by domain */}
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-ink">Leads by domain</h3>
        {byDomain.length === 0 ? (
          <p className="text-sm text-muted">No leads yet.</p>
        ) : (
          <div className="space-y-3">
            {byDomain.map((d) => (
              <div key={d.key} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <DomainChip domain={d.key} />
                </div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${DOMAIN_META[d.key].solid} transition-all duration-500`}
                    style={{ width: `${Math.round((d.leads / domainMax) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-medium text-ink">{d.leads}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
