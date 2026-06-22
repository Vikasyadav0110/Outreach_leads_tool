import Link from "next/link";
import CampaignsListV2 from "@/app/components/CampaignsListV2";
import PageHeader from "@/app/components/PageHeader";
import { listCampaignsV2 } from "@/lib/db";
import { moduleMeta } from "@/lib/modules";
import { getActiveModule } from "@/lib/activeModule";

export const dynamic = "force-dynamic";

export default function CampaignsPage() {
  const mod = getActiveModule();
  const campaigns = listCampaignsV2(mod);
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
      <CampaignsListV2 campaigns={campaigns} />
    </div>
  );
}
