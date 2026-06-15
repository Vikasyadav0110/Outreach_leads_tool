import {
  KpiCard,
  ChartCard,
  DonutChart,
  HBarChart,
  AreaTrendChart,
} from "@/app/components/charts";
import { CHART, STATUS_COLORS } from "@/app/components/chartColors";
import { LEAD_STATUSES } from "@/app/components/status";
import { fmtCost } from "@/app/components/format";
import {
  funnel,
  statusMix,
  leadsPerWeek,
  nichePerformance,
  sourcePerformance,
  sourceConversion,
  dealStats,
  unitEconomics,
} from "@/lib/analytics";
import PageHeader from "@/app/components/PageHeader";
import { listCampaigns, listAllLeads, listSourcedLeads } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";
import { moduleMeta, pipelineOf } from "@/lib/modules";
import { getActiveModule } from "@/lib/activeModule";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const mod = getActiveModule();
  const campaigns = listCampaigns(mod);
  const mock = isMockMode();

  if (campaigns.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" />
        <div className="card p-10 text-center text-sm text-muted">
          No data yet. Run a campaign to see analytics.
        </div>
      </div>
    );
  }

  const allLeads = listAllLeads(mod);
  const sourced = listSourcedLeads({ pipeline: pipelineOf(mod), limit: 5000 });
  const ue = unitEconomics(campaigns);
  const funnelData = funnel(campaigns);
  const weekData = leadsPerWeek(campaigns);
  const mix = statusMix(campaigns);
  const statusData = LEAD_STATUSES.map((s) => ({ name: s.label, value: mix[s.key] || 0, color: STATUS_COLORS[s.key] }));
  const sourceData = sourcePerformance(sourced).map((s) => ({ name: s.name, value: s.count }));
  const nicheData = nichePerformance(allLeads).map((n) => ({ name: n.name, value: n.leads }));
  const deals = dealStats(allLeads);
  const srcConv = sourceConversion(sourced, allLeads);
  const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle={`${moduleMeta(mod).label} · conversion, sourcing and unit economics.`} />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <KpiCard label="Campaigns" value={campaigns.length} />
        <KpiCard label="Leads" value={ue.leads} tone="accent" />
        <KpiCard label="Qualified" value={ue.qualified} />
        <KpiCard label="Messaged" value={ue.messaged} />
        <KpiCard label="Won" value={ue.won} tone="success" />
        <KpiCard label="Win rate" value={`${ue.winRate}%`} tone="success" />
        <KpiCard label="Reply rate" value={`${ue.replyRate}%`} tone="warning" />
        <KpiCard label={mock ? "Spend (sim)" : "Spend"} value={fmtCost(ue.spend)} />
      </div>

      {/* Revenue & deals — the money view (from won/lost deal data) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Revenue &amp; deals</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <KpiCard label="Pipeline won" value={inr(deals.wonValue)} tone="success" sub={`${deals.wonCount} deals`} />
          <KpiCard label="Your commission" value={inr(deals.wonCommission)} tone="accent" sub="from won deals" />
          <KpiCard label="Avg deal size" value={inr(deals.avgDealValue)} />
          <KpiCard label="Avg days to close" value={deals.avgDaysToClose || "—"} sub={`${deals.lostCount} lost`} />
        </div>
        {deals.lossReasons.length > 0 && (
          <div className="mt-4">
            <ChartCard title="Why deals are lost">
              <HBarChart
                data={deals.lossReasons}
                color={CHART.accent2 || CHART.accent}
                height={Math.max(120, deals.lossReasons.length * 34)}
              />
            </ChartCard>
          </div>
        )}
      </section>

      {/* Funnel + conversion */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Outreach funnel">
          <HBarChart data={funnelData} color={CHART.accent} height={195} />
        </ChartCard>
        <ChartCard title="Conversion by stage">
          <div className="divide-y divide-line">
            {funnelData.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{s.name}</span>
                <span className="flex items-center gap-3 text-muted">
                  <span className="font-medium text-ink tabular-nums">{s.value}</span>
                  {i > 0 && (
                    <span className="w-14 rounded-full bg-neutral-100 px-2 py-0.5 text-right text-xs tabular-nums">
                      {s.conv}%
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Trend + status */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Leads per week">
          <AreaTrendChart data={weekData} color={CHART.accent} />
        </ChartCard>
        <ChartCard title="Lead status mix">
          <DonutChart data={statusData} />
        </ChartCard>
      </div>

      {/* Source + niche performance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Leads by source">
          <HBarChart data={sourceData} color={CHART.violet} />
        </ChartCard>
        <ChartCard title="Top niches by leads">
          <HBarChart data={nicheData} color={CHART.accent2} />
        </ChartCard>
      </div>

      {/* Which source actually closes (conversion, not just volume) */}
      {srcConv.some((s) => s.worked > 0) && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink">Source ROI · which source converts</h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f3f3f0] text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 text-right font-medium">Sourced</th>
                  <th className="px-3 py-2 text-right font-medium">Worked</th>
                  <th className="px-3 py-2 text-right font-medium">Reply %</th>
                  <th className="px-3 py-2 text-right font-medium">Win %</th>
                </tr>
              </thead>
              <tbody>
                {srcConv.map((s) => (
                  <tr key={s.name} className="border-t border-line even:bg-[#fafaf8]">
                    <td className="px-3 py-2 font-medium text-ink">{s.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{s.sourced}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{s.worked}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.worked ? `${s.replyRate}%` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-success">{s.worked ? `${s.winRate}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unit economics */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">Unit economics</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
          <KpiCard label="Total spend" value={fmtCost(ue.spend)} />
          <KpiCard label="Cost / lead" value={fmtCost(ue.costPerLead)} tone="accent" />
          <KpiCard label="Cost / qualified" value={fmtCost(ue.costPerQualified)} />
          <KpiCard label="Cost / won" value={fmtCost(ue.costPerWon)} tone="success" />
          <KpiCard label="Tokens used" value={ue.tokens.toLocaleString()} />
        </div>
      </div>
    </div>
  );
}
