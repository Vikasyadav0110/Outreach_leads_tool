import Link from "next/link";
import CampaignsTable from "./components/CampaignsTable";
import EmptyDashboard from "./components/EmptyDashboard";
import PageHeader from "./components/PageHeader";
import TodayTasks from "./components/TodayTasks";
import {
  KpiCard,
  ChartCard,
  DonutChart,
  HBarChart,
  AreaTrendChart,
} from "./components/charts";
import { CHART, STATUS_COLORS } from "./components/chartColors";
import { LEAD_STATUSES } from "./components/status";
import { DOMAIN_META, DOMAIN_ORDER } from "./components/Brand";
import { fmtCost } from "./components/format";
import { funnel, statusMix, leadsPerWeek, unitEconomics } from "@/lib/analytics";
import { listCampaigns, listSourcedLeads, listTasks } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";
import { moduleMeta, pipelineOf } from "@/lib/modules";
import { getActiveModule } from "@/lib/activeModule";

// Server component: read campaigns straight from SQLite on each load.
export const dynamic = "force-dynamic";

export default function Dashboard() {
  const mod = getActiveModule();
  const campaigns = listCampaigns(mod);
  const sourced = listSourcedLeads({ pipeline: pipelineOf(mod), limit: 1000 });
  const tasks = listTasks({ module: mod });

  // First-run: nothing at all in this module yet → guided onboarding.
  if (campaigns.length === 0 && sourced.length === 0) {
    return <EmptyDashboard mock={isMockMode()} />;
  }

  const mock = isMockMode();
  const hasCampaigns = campaigns.length > 0;
  const ue = unitEconomics(campaigns);
  const funnelData = funnel(campaigns);
  const mix = statusMix(campaigns);
  const statusData = LEAD_STATUSES.map((s) => ({
    name: s.label,
    value: mix[s.key] || 0,
    color: STATUS_COLORS[s.key],
  }));
  const weekData = leadsPerWeek(campaigns);
  const domainData = DOMAIN_ORDER.map((k) => ({
    name: DOMAIN_META[k].label,
    value: campaigns.filter((c) => c.domain === k).reduce((n, c) => n + (c.leadsFound || 0), 0),
  })).filter((d) => d.value > 0);

  // Sourced-leads rollups (so the dashboard reflects sourcing, not just campaigns).
  const bySource = (() => {
    const m = new Map();
    for (const l of sourced) m.set(l.source || "—", (m.get(l.source || "—") || 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  })();
  const recentSourced = sourced.slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`${moduleMeta(mod).label} · campaigns and sourced leads at a glance.`} />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:gap-4">
        <KpiCard label="Campaigns" value={campaigns.length} />
        <KpiCard label="Sourced leads" value={sourced.length} tone="accent2" />
        <KpiCard label="Campaign leads" value={ue.leads} tone="accent" />
        <KpiCard label="Won" value={ue.won} tone="success" />
        <KpiCard label="Win rate" value={`${ue.winRate}%`} sub="of qualified" tone="success" />
        <KpiCard label={mock ? "Cost/lead (sim)" : "Cost/lead"} value={fmtCost(ue.costPerLead)} sub={`${fmtCost(ue.spend)} total`} />
      </div>

      {/* Today's follow-ups — the chase queue (auto-scheduled when a lead is contacted) */}
      <TodayTasks initialTasks={tasks} />

      {/* Campaign charts — only meaningful once campaigns exist */}
      {hasCampaigns && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Outreach funnel">
            <HBarChart data={funnelData} color={CHART.accent} height={195} />
          </ChartCard>
          <ChartCard title="Lead status mix">
            <DonutChart data={statusData} />
          </ChartCard>
          <ChartCard title="Leads per week">
            <AreaTrendChart data={weekData} color={CHART.accent} />
          </ChartCard>
          <ChartCard title="Leads by domain">
            <HBarChart data={domainData} color={CHART.accent2} />
          </ChartCard>
        </div>
      )}

      {/* Sourced leads */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Sourced leads</h2>
          <Link href="/sources" className="text-sm font-medium text-accent hover:underline">Open Sources →</Link>
        </div>
        {sourced.length === 0 ? (
          <div className="card p-5 text-sm text-muted">
            No sourced leads in this module yet. <Link href="/sources" className="text-accent hover:underline">Source some →</Link>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Leads by source">
              <HBarChart data={bySource} color={CHART.accent} height={165} />
            </ChartCard>
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Recent</h3>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Business</th><th>Signal</th><th>Score</th></tr>
                  </thead>
                  <tbody>
                    {recentSourced.map((l) => (
                      <tr key={l.id}>
                        <td className="font-medium text-ink">{l.name}</td>
                        <td className="text-muted">{l.signal || "—"}</td>
                        <td className="tabular-nums">{l.score ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {hasCampaigns && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Past campaigns</h2>
          <CampaignsTable campaigns={campaigns} />
        </section>
      )}
    </div>
  );
}
