"use client";

import { useRouter } from "next/navigation";
import { toast } from "./toast";

export default function DeleteCampaignButton({ id, label }) {
  const router = useRouter();

  async function del() {
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Campaign deleted.");
      router.push("/");
    } catch {
      toast("Couldn't delete campaign.", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={del}
      className="btn-ghost shrink-0 border-red-200 px-3 py-2 text-sm text-danger hover:bg-red-50"
    >
      Delete
    </button>
  );
}
