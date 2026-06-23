import { notFound } from "next/navigation";
import { getCampaignV2, listSequences, getSettings } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";
import { getActiveModule } from "@/lib/activeModule";
import PageHeader from "@/app/components/PageHeader";
import DeleteCampaignButton from "@/app/components/DeleteCampaignButton";
import CampaignDetail from "./CampaignDetail";

export const dynamic = "force-dynamic";

export default function CampaignPage({ params }) {
  const campaign = getCampaignV2(Number(params.id));
  if (!campaign) notFound();
  const sequences = listSequences(campaign.module || getActiveModule());
  const s = getSettings();
  const profile = { me: s.name || "", myLocation: s.location || "" }; // template tokens

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/campaigns"
        backLabel="All campaigns"
        title={campaign.name}
        subtitle={`Campaign #${campaign.id} · ${campaign.members.length} leads`}
        action={<DeleteCampaignButton id={campaign.id} label={campaign.name} />}
      />
      <CampaignDetail initialCampaign={campaign} sequences={sequences} profile={profile} mock={isMockMode()} />
    </div>
  );
}
