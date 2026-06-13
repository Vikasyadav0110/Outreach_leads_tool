import TemplatesManager from "@/app/components/TemplatesManager";
import { listSnippets } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  const snippets = listSnippets();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-display text-xl text-ink">Templates</h1>
        <p className="text-sm text-muted">
          Reusable message snippets you can copy into any outreach.
        </p>
      </div>
      <TemplatesManager initial={snippets} />
    </div>
  );
}
