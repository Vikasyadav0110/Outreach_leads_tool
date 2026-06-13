import CampaignsTable from "./components/CampaignsTable";
import StatTile from "./components/StatTile";
import EmptyDashboard from "./components/EmptyDashboard";
import DashboardCharts from "./components/DashboardCharts";
import { fmtCost } from "./components/format";
import { listCampaigns } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";

// Server component: read campaigns straight from SQLite on each load.
export const dynamic = "force-dynamic";

export default function Dashboard() {
  const campaigns = listCampaigns();

  // First-run experience: no campaigns yet → guided onboarding.
  if (campaigns.length === 0) {
    return <EmptyDashboard mock={isMockMode()} />;
  }

  const totalLeads = campaigns.reduce((n, c) => n + (c.leadsFound || 0), 0);
  const totalWon = campaigns.reduce((n, c) => n + (c.outcomeCounts?.won || 0), 0);
  const totalCost = campaigns.reduce((n, c) => n + (c.usage?.costUsd || 0), 0);
  const mock = isMockMode();

  // Compact, serializable rows for the client charts (no big JSON arrays).
  const chartData = campaigns.map((c) => ({
    domain: c.domain,
    leads: c.leadsFound || 0,
    qualified: Array.isArray(c.qualified) ? c.qualified.length : 0,
    messaged: Array.isArray(c.messages) ? c.messages.length : 0,
    outcomes: c.outcomeCounts || {},
  }));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatTile label="Campaigns" value={campaigns.length} />
        <StatTile label="Leads found" value={totalLeads} />
        <StatTile label="Won" value={totalWon} valueClass="text-success" />
        <StatTile label={mock ? "Est. spend (sim)" : "Est. spend"} value={fmtCost(totalCost)} />
      </div>

      <DashboardCharts data={chartData} />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Past campaigns</h2>
        <CampaignsTable campaigns={campaigns} />
      </section>
    </div>
  );
}
