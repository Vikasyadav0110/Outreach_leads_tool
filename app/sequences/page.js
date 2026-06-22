import SequencesManager from "@/app/components/SequencesManager";
import PageHeader from "@/app/components/PageHeader";
import { listSequences } from "@/lib/db";
import { getActiveModule } from "@/lib/activeModule";
import { moduleMeta } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default function SequencesPage() {
  const mod = getActiveModule();
  const sequences = listSequences(mod);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sequences"
        subtitle={`${moduleMeta(mod).label} · multi-step follow-up cadences. Attach one to a campaign and each step lands in Today.`}
      />
      <SequencesManager initial={sequences} />
    </div>
  );
}
