import EmptyDashboard from "./components/EmptyDashboard";
import TodayWorkspace from "./components/TodayWorkspace";
import {
  listTasks,
  listRepliesToAction,
  listHotLeads,
  listCampaignsV2,
  listSourcedLeads,
  listLeads,
} from "@/lib/db";
import { leadFunnel } from "@/lib/analytics";
import { isMockMode } from "@/lib/anthropic";
import { pipelineOf } from "@/lib/modules";
import { getActiveModule } from "@/lib/activeModule";

// Home = the "Today" workspace: the daily action queue (follow-ups, replies,
// hot leads), not a stats dashboard. Analytics/charts live at /analytics.
export const dynamic = "force-dynamic";

export default function Today() {
  const mod = getActiveModule();
  const tasks = listTasks({ module: mod });
  const replies = listRepliesToAction(mod);
  const hot = listHotLeads(mod);
  const campaigns = listCampaignsV2(mod);
  const mock = isMockMode();

  // First-run: nothing at all in this module yet → guided onboarding.
  const leadStats = leadFunnel(listLeads(mod));
  const sourced = listSourcedLeads({ pipeline: pipelineOf(mod), limit: 1 });
  if (
    tasks.length === 0 && replies.length === 0 && hot.length === 0 &&
    campaigns.length === 0 && sourced.length === 0 && leadStats.found === 0
  ) {
    return <EmptyDashboard mock={mock} />;
  }

  return (
    <TodayWorkspace
      tasks={tasks}
      replies={replies}
      hot={hot}
      campaigns={campaigns}
      mock={mock}
    />
  );
}
