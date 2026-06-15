import Link from "next/link";
import CampaignsTable from "@/app/components/CampaignsTable";
import PageHeader from "@/app/components/PageHeader";
import { listCampaigns } from "@/lib/db";
import { moduleMeta } from "@/lib/modules";
import { getActiveModule } from "@/lib/activeModule";

export const dynamic = "force-dynamic";

export default function CampaignsPage() {
  const mod = getActiveModule();
  const campaigns = listCampaigns(mod);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        subtitle={`${moduleMeta(mod).label} · ${campaigns.length} total`}
        action={
          <Link href="/campaigns/new" className="btn-primary">
            New campaign
          </Link>
        }
      />
      <CampaignsTable campaigns={campaigns} />
    </div>
  );
}
