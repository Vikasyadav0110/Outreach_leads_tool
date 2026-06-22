"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import EmptyState from "./EmptyState";
import { fmtDate } from "./format";
import { toast } from "./toast";
import { TrashIcon } from "./icons";

const CHANNEL_LABEL = { email: "Email", whatsapp: "WhatsApp", call: "Call", multi: "Multi" };
const STATUS = {
  draft: { label: "Draft", cls: "bg-neutral-100 text-muted" },
  messages_ready: { label: "Messages ready", cls: "bg-blue-50 text-accent" },
  active: { label: "Active", cls: "bg-green-50 text-success" },
};

export default function CampaignsListV2({ campaigns }) {
  const router = useRouter();
  if (!campaigns || campaigns.length === 0) {
    return (
      <EmptyState
        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>}
        title="No campaigns yet"
        hint="A campaign reaches out to a set of qualified leads. Pick leads on the Leads page, or start a campaign here."
        action={<Link href="/campaigns/new" className="btn-primary">New campaign</Link>}
      />
    );
  }
  async function del(e, c) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${c.name}"? Leads stay in your Leads hub; only this campaign is removed.`)) return;
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Campaign deleted.");
      router.refresh();
    } catch { toast("Couldn't delete.", "error"); }
  }
  return (
    <div className="table-wrap">
      <table className="data-table min-w-[680px]">
        <thead><tr><th>Date</th><th>Name</th><th>Channel</th><th>Leads</th><th>Messaged</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {campaigns.map((c) => {
            const st = STATUS[c.status] || STATUS.draft;
            return (
              <tr key={c.id} role="link" tabIndex={0} onClick={() => router.push(`/campaign/${c.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(`/campaign/${c.id}`); }}
                className="cursor-pointer transition-colors duration-150 focus-visible:bg-[#eef1f8]">
                <td className="px-4 py-3 text-muted">{fmtDate(c.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                <td className="px-4 py-3 text-muted">{CHANNEL_LABEL[c.channel] || c.channel}</td>
                <td className="px-4 py-3 text-muted tabular-nums">{c.leadCount}</td>
                <td className="px-4 py-3 text-muted tabular-nums">{c.messagedCount || "—"}</td>
                <td className="px-4 py-3"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <span className="inline-flex items-center gap-1 font-medium text-accent">View
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </span>
                    <button type="button" onClick={(e) => del(e, c)} aria-label={`Delete ${c.name}`} className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-danger">
                      <TrashIcon width="15" height="15" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
