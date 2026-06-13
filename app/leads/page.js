import LeadsManager from "@/app/components/LeadsManager";
import { listAllLeads } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

export default function LeadsPage() {
  const leads = listAllLeads();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-display text-xl text-ink">Leads Management</h1>
        <p className="text-sm text-muted">
          Every lead across all campaigns — browse by category or as one list. Click any lead to view its details.
        </p>
      </div>
      <LeadsManager leads={leads} mock={isMockMode()} />
    </div>
  );
}
