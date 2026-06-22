import { KpiCard, ChartCard, DonutChart, HBarChart } from "@/app/components/charts";
import { CHART } from "@/app/components/chartColors";
import { fmtCost } from "@/app/components/format";
import PageHeader from "@/app/components/PageHeader";
import EmptyState from "@/app/components/EmptyState";
import {
  campaignsForAnalytics,
  leadsForAnalytics,
  listSourcedLeads,
  reportRollups,
} from "@/lib/db";
import { unitEconomicsReal, sourceConversion, dealStats } from "@/lib/analytics";
import { isMockMode } from "@/lib/anthropic";
import { moduleMeta, pipelineOf } from "@/lib/modules";
import { getActiveModule } from "@/lib/activeModule";

// Reports = the money view. Every figure here comes from the usage_events ledger
// (real spend), joined with outcomes/deals — answers "what did each lead/source
// cost, and which spend earns its budget?".
export const dynamic = "force-dynamic";

export default function ReportsPage() {
  const mod = getActiveModule();
  const roll = reportRollups(mod); // authoritative spend (ledger, mock-excluded)
  const mock = isMockMode();

  if (!roll.totals.rows) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" subtitle={`${moduleMeta(mod).label} · cost ↔ outcome.`} />
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12" y="7" width="3" height="10" /><rect x="17" y="14" width="3" height="3" /></svg>}
          title="No spend recorded yet"
          hint="Once you Find, Qualify, or enrich leads with a live AI key, your costs and cost-per-outcome show up here."
        />
      </div>
    );
  }

  const campaigns = campaignsForAnalytics(mod);
  const allLeads = leadsForAnalytics(mod);
  const sourced = listSourcedLeads({ pipeline: pipelineOf(mod), limit: 5000 });

  const spend = roll.totals.usd;
  const tokens = roll.totals.tokens;
  const ue = unitEconomicsReal(campaigns, spend, tokens); // real cost-per-outcome
  const deals = dealStats(allLeads);

  // Per-source ROI: conversion (reply/win) joined with real $ spent per source.
  const conv = sourceConversion(sourced, allLeads);
  const spendBySource = new Map(roll.bySource.map((s) => [s.name, s.usd]));
  const sourceRoi = conv.map((s) => {
    const usd = spendBySource.get(s.name) || 0;
    return { ...s, usd, costPerWon: s.won ? usd / s.won : 0 };
  });

  const taskData = roll.byTask.map((t) => ({ name: t.name, value: +t.usd.toFixed(4) }));
  const providerData = roll.byProvider.map((p) => ({ name: p.name, value: +p.usd.toFixed(4), color: p.name === "gemini" ? CHART.violet : CHART.accent }));

  const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;
  // ROI: won commission (your earnings) vs AI spend.
  const roi = spend > 0 ? deals.wonCommission / spend : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle={`${moduleMeta(mod).label} · cost ↔ outcome${mock ? " (test mode — figures from live rows only)" : ""}.`}
      />

      {/* Money KPIs — from the ledger, not campaigns_v2.usage_json */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
        <KpiCard label="Total spend" value={fmtCost(spend)} tone="accent" />
        <KpiCard label="Cost / lead" value={fmtCost(ue.costPerLead)} />
        <KpiCard label="Cost / qualified" value={fmtCost(ue.costPerQualified)} />
        <KpiCard label="Cost / won" value={fmtCost(ue.costPerWon)} tone="success" />
        <KpiCard label="Tokens" value={tokens.toLocaleString()} />
      </div>

      {/* Revenue vs spend — the ROI headline */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Return on spend</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <KpiCard label="Won (deal value)" value={inr(deals.wonValue)} tone="success" sub={`${deals.wonCount} deals`} />
          <KpiCard label="Your commission" value={inr(deals.wonCommission)} tone="accent" />
          <KpiCard label="AI spend" value={fmtCost(spend)} />
          <KpiCard label="Return on spend" value={`${roi.toFixed(1)}×`} tone={roi >= 1 ? "success" : "ink"} sub="commission ÷ spend" />
        </div>
      </section>

      {/* Where the money goes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spend by task">
          <HBarChart data={taskData} color={CHART.accent} height={Math.max(120, taskData.length * 34)} />
        </ChartCard>
        <ChartCard title="Spend by provider">
          <DonutChart data={providerData} />
        </ChartCard>
      </div>

      {/* Source ROI — which source earns its budget */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Source ROI · which source earns its budget</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f3f3f0] text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 text-right font-medium">Sourced</th>
                <th className="px-3 py-2 text-right font-medium">Worked</th>
                <th className="px-3 py-2 text-right font-medium">Reply %</th>
                <th className="px-3 py-2 text-right font-medium">Win %</th>
                <th className="px-3 py-2 text-right font-medium">Spend</th>
                <th className="px-3 py-2 text-right font-medium">$ / won</th>
              </tr>
            </thead>
            <tbody>
              {sourceRoi.map((s) => (
                <tr key={s.name} className="border-t border-line even:bg-[#fafaf8]">
                  <td className="px-3 py-2 font-medium text-ink">{s.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{s.sourced}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{s.worked}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.worked ? `${s.replyRate}%` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-success">{s.worked ? `${s.winRate}%` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.usd ? fmtCost(s.usd) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.won ? fmtCost(s.costPerWon) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Spend is attributed per source via per-lead AI usage; “(discovery)” covers pre-lead search costs.</p>
      </section>
    </div>
  );
}
