import Link from "next/link";
import NewCampaignCard from "@/app/components/NewCampaignCard";

export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Dashboard
        </Link>
        <h1 className="h-display mt-1 text-xl text-ink">New campaign</h1>
        <p className="text-sm text-muted">
          Pick a domain, city, and niche — the 4-agent pipeline runs end to end.
        </p>
      </div>
      <NewCampaignCard />
    </div>
  );
}
