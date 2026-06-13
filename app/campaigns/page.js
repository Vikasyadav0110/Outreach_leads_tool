import Link from "next/link";
import CampaignsTable from "@/app/components/CampaignsTable";
import { listCampaigns } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function CampaignsPage() {
  const campaigns = listCampaigns();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="h-display text-xl text-ink">Campaigns</h1>
          <p className="text-sm text-muted">{campaigns.length} total</p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">
          New campaign
        </Link>
      </div>
      <CampaignsTable campaigns={campaigns} />
    </div>
  );
}
