import SourceRunner from "@/app/components/SourceRunner";
import { listAdapters } from "@/lib/sources";
import { listSourcedLeads, listIngestRuns, sourcedStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  const adapters = listAdapters();
  const leads = listSourcedLeads({ limit: 300 });
  const runs = listIngestRuns(8);
  const stats = sourcedStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-display text-xl text-ink">Sources</h1>
        <p className="text-sm text-muted">
          Scrape leads for each pipeline separately and watch them arrive in real time. Deliver-track
          feeds your team; sell-track feeds your IT partners.
        </p>
      </div>
      <SourceRunner adapters={adapters} initialLeads={leads} runs={runs} stats={stats} />
    </div>
  );
}
