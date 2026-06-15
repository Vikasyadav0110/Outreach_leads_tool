import { NextResponse } from "next/server";
import { getCampaign, setOutcome } from "@/lib/db";
import { STATUS_KEYS } from "@/app/components/status";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

// Upsert a single lead's pipeline status / notes for this campaign.
export async function POST(req, { params }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const id = Number(params.id);
    if (!getCampaign(id)) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const { leadName, status, notes, deal } = await req.json();
    if (!leadName || typeof leadName !== "string") {
      return NextResponse.json({ error: "leadName is required." }, { status: 400 });
    }
    if (status != null && !STATUS_KEYS.includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    if (deal != null && typeof deal !== "object") {
      return NextResponse.json({ error: "Invalid deal." }, { status: 400 });
    }

    const outcome = setOutcome(id, { leadName: leadName.trim(), status, notes, deal });
    return NextResponse.json({ outcome });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to save outcome." },
      { status: 500 }
    );
  }
}
