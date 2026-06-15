import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";
import { DomainChip } from "@/app/components/Brand";
import PageHeader from "@/app/components/PageHeader";
import DeleteCampaignButton from "@/app/components/DeleteCampaignButton";
import CampaignRunner from "./CampaignRunner";

export const dynamic = "force-dynamic";

export default function CampaignPage({ params, searchParams }) {
  const campaign = getCampaign(Number(params.id));
  if (!campaign) notFound();

  const autorun = searchParams?.autorun === "1";

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/campaigns"
        backLabel="All campaigns"
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {campaign.niche} · {campaign.city}
            <DomainChip domain={campaign.domain} />
          </span>
        }
        subtitle={`Campaign #${campaign.id}`}
        action={
          <DeleteCampaignButton id={campaign.id} label={`${campaign.niche} · ${campaign.city}`} />
        }
      />

      <CampaignRunner initialCampaign={campaign} autorun={autorun} mock={isMockMode()} />
    </div>
  );
}
