import LeadsManager from "@/app/components/LeadsManager";
import PageHeader from "@/app/components/PageHeader";
import { listAllLeads } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";
import { moduleMeta } from "@/lib/modules";
import { getActiveModule } from "@/lib/activeModule";

export const dynamic = "force-dynamic";

export default function LeadsPage() {
  const mod = getActiveModule();
  const leads = listAllLeads(mod);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads Management"
        subtitle={`${moduleMeta(mod).label} · browse by category or as one list. Click any lead to view its details.`}
      />
      <LeadsManager leads={leads} mock={isMockMode()} />
    </div>
  );
}
