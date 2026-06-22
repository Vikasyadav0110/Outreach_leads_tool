import Link from "next/link";

// First-run state (no leads/campaigns yet). Points the user at the real flow:
// 1) Find leads  →  2) Qualify  →  3) Build a campaign & send.
export default function EmptyDashboard({ mock }) {
  return (
    <div className="space-y-6">
      {mock && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Test mode.</span> Add a live AI key in{" "}
          <Link href="/settings" className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950">Settings → API Management</Link>{" "}
          for real leads &amp; messages.
        </div>
      )}
      <div className="card p-10 text-center">
        <h2 className="text-lg font-semibold text-ink">Welcome — let’s get your first leads</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          OutreachPilot works in three steps:
          <span className="mt-3 block text-ink">
            1. <span className="font-medium">Find leads</span> &nbsp;→&nbsp; 2. <span className="font-medium">Qualify &amp; Score</span> &nbsp;→&nbsp; 3. <span className="font-medium">Build a campaign &amp; send</span>
          </span>
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/leads" className="btn-primary px-5 py-2.5">Find Leads</Link>
          <Link href="/sources" className="btn-ghost px-5 py-2.5">Browse Sources</Link>
        </div>
      </div>
    </div>
  );
}
