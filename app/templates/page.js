import TemplatesManager from "@/app/components/TemplatesManager";
import PageHeader from "@/app/components/PageHeader";
import { listSnippets } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  const snippets = listSnippets();
  return (
    <div className="space-y-6">
      <PageHeader title="Templates" subtitle="Saved messages you can reuse in any outreach (Templates)." />
      <TemplatesManager initial={snippets} />
    </div>
  );
}
