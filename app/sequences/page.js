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
        subtitle={`${moduleMeta(mod).label} · automatic follow-up reminders (Cadences). Attach one to a campaign and each step shows up in Today.`}
      />
      <SequencesManager initial={sequences} />
    </div>
  );
}
