import GenerateWizard from "@/app/components/GenerateWizard";
import PageHeader from "@/app/components/PageHeader";
import { isMockMode } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

export default function GeneratePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Start here"
        title="Generate leads"
        subtitle="The simplest way to get clients: tell us who to look for, and the app finds them, checks fit, and writes your outreach — all in one go."
      />
      <GenerateWizard mock={isMockMode()} />
    </div>
  );
}
