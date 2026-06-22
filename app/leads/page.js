import LeadsHub from "@/app/components/LeadsHub";
import PageHeader from "@/app/components/PageHeader";
import { listLeads, listCampaignsV2 } from "@/lib/db";
import { moduleMeta } from "@/lib/modules";
import { getActiveModule } from "@/lib/activeModule";
import { isMockMode } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

export default function LeadsPage() {
  const mod = getActiveModule();
  const leads = listLeads(mod);
  const campaigns = listCampaignsV2(mod);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle={`${moduleMeta(mod).label} · your data hub. Find, qualify, then add leads to a campaign.`}
      />
      <LeadsHub leads={leads} campaigns={campaigns} mock={isMockMode()} />
    </div>
  );
}
