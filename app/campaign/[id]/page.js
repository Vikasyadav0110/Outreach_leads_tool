import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";
import { DomainChip } from "@/app/components/Brand";
import DeleteCampaignButton from "@/app/components/DeleteCampaignButton";
import CampaignRunner from "./CampaignRunner";

export const dynamic = "force-dynamic";

export default function CampaignPage({ params, searchParams }) {
  const campaign = getCampaign(Number(params.id));
  if (!campaign) notFound();

  const autorun = searchParams?.autorun === "1";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-ink">
            ← All campaigns
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="h-display text-xl text-ink">
              {campaign.niche} · {campaign.city}
            </h1>
            <DomainChip domain={campaign.domain} />
          </div>
          <p className="text-sm text-muted">Campaign #{campaign.id}</p>
        </div>
        <DeleteCampaignButton
          id={campaign.id}
          label={`${campaign.niche} · ${campaign.city}`}
        />
      </div>

      <CampaignRunner initialCampaign={campaign} autorun={autorun} mock={isMockMode()} />
    </div>
  );
}
