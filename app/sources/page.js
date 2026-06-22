import SourceRunner from "@/app/components/SourceRunner";
import PageHeader from "@/app/components/PageHeader";
import { listAdapters } from "@/lib/sources";
import { listSourcedLeads, listIngestRuns, sourcedStats, listSavedSearches, sourceHealth } from "@/lib/db";
import { moduleMeta, pipelineOf } from "@/lib/modules";
import { getActiveModule } from "@/lib/activeModule";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  const mod = getActiveModule();
  const meta = moduleMeta(mod);
  const pipeline = pipelineOf(mod);

  // Universal sources (e.g. Google Places) appear in every module; others only
  // in the module matching their pipeline.
  const adapters = listAdapters().filter((a) => a.universal || a.pipeline === pipeline);
  const leads = listSourcedLeads({ pipeline, limit: 300 });
  const runs = listIngestRuns(50).filter((r) => r.pipeline === pipeline).slice(0, 8);
  const s = sourcedStats();
  const total = pipeline === "sell" ? s.sell : s.deliver;
  const savedSearches = listSavedSearches({ module: mod, scope: "source" });
  // Per-connector health (yield, last status/error). Label by adapter id.
  const labelById = Object.fromEntries(adapters.map((a) => [a.id, a.label]));
  const health = sourceHealth(pipeline, adapters.map((a) => a.id))
    .map((h) => ({ ...h, label: labelById[h.source] || h.source }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sources"
        subtitle={`${meta.label} · find and stream leads for this module in real time.`}
      />
      <SourceRunner
        adapters={adapters}
        initialLeads={leads}
        runs={runs}
        total={total}
        moduleLabel={meta.label}
        pipeline={pipeline}
        savedSearches={savedSearches}
        health={health}
      />
    </div>
  );
}
