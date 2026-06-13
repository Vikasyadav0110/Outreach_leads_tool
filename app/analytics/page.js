import StatTile from "@/app/components/StatTile";
import DashboardCharts from "@/app/components/DashboardCharts";
import { LEAD_STATUSES } from "@/app/components/status";
import { fmtCost } from "@/app/components/format";
import { listCampaigns } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const campaigns = listCampaigns();
  const mock = isMockMode();

  const totalLeads = campaigns.reduce((n, c) => n + (c.leadsFound || 0), 0);
  const totalQualified = campaigns.reduce((n, c) => n + (Array.isArray(c.qualified) ? c.qualified.length : 0), 0);
  const totalMessaged = campaigns.reduce((n, c) => n + (Array.isArray(c.messages) ? c.messages.length : 0), 0);
  const totalWon = campaigns.reduce((n, c) => n + (c.outcomeCounts?.won || 0), 0);
  const totalCost = campaigns.reduce((n, c) => n + (c.usage?.costUsd || 0), 0);

  const chartData = campaigns.map((c) => ({
    domain: c.domain,
    leads: c.leadsFound || 0,
    qualified: Array.isArray(c.qualified) ? c.qualified.length : 0,
    messaged: Array.isArray(c.messages) ? c.messages.length : 0,
    outcomes: c.outcomeCounts || {},
  }));

  // Status breakdown across all leads (untracked leads count as "new").
  const statusCounts = {};
  for (const c of campaigns) {
    for (const [k, v] of Object.entries(c.outcomeCounts || {})) {
      statusCounts[k] = (statusCounts[k] || 0) + v;
    }
  }
  const tracked = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  statusCounts.new = (statusCounts.new || 0) + Math.max(0, totalLeads - tracked);
  const statusMax = Math.max(1, ...LEAD_STATUSES.map((s) => statusCounts[s.key] || 0));

  if (campaigns.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="h-display text-xl text-ink">Analytics</h1>
        <div className="card p-10 text-center text-sm text-muted">
          No data yet. Run a campaign to see analytics.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="h-display text-xl text-ink">Analytics</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:gap-4">
        <StatTile label="Campaigns" value={campaigns.length} />
        <StatTile label="Leads" value={totalLeads} />
        <StatTile label="Qualified" value={totalQualified} />
        <StatTile label="Messaged" value={totalMessaged} />
        <StatTile label="Won" value={totalWon} valueClass="text-success" />
        <StatTile label={mock ? "Spend (sim)" : "Spend"} value={fmtCost(totalCost)} />
      </div>

      <DashboardCharts data={chartData} />

      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-ink">Lead status breakdown</h3>
        <div className="space-y-3">
          {LEAD_STATUSES.map((s) => {
            const n = statusCounts[s.key] || 0;
            return (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs font-medium text-muted">{s.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${s.dot} transition-all duration-500`}
                    style={{ width: `${Math.round((n / statusMax) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-medium text-ink">{n}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
