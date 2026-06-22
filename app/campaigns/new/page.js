import PageHeader from "@/app/components/PageHeader";
import CampaignWizard from "@/app/components/CampaignWizard";
import { listLeads } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";
import { getActiveModule } from "@/lib/activeModule";

export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  const mod = getActiveModule();
  // Campaigns are built from qualified leads (reusable across campaigns).
  const qualifiedLeads = listLeads(mod).filter((l) => l.qualified);
  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/campaigns"
        backLabel="All campaigns"
        title="New campaign"
        subtitle="Select qualified leads, generate messages, then review & send."
      />
      <CampaignWizard qualifiedLeads={qualifiedLeads} mock={isMockMode()} />
    </div>
  );
}
