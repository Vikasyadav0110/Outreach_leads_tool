import TemplatesManager from "@/app/components/TemplatesManager";
import PageHeader from "@/app/components/PageHeader";
import { listSnippets } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  const snippets = listSnippets();
  return (
    <div className="space-y-6">
      <PageHeader title="Templates" subtitle="Reusable message snippets you can copy into any outreach." />
      <TemplatesManager initial={snippets} />
    </div>
  );
}
