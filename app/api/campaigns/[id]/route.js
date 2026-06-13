import { NextResponse } from "next/server";
import { getCampaign, deleteCampaign } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const campaign = getCampaign(Number(params.id));
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    return NextResponse.json({ campaign });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not load campaign." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req, { params }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const id = Number(params.id);
    if (!getCampaign(id)) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    deleteCampaign(id); // lead_outcomes cascade via FK
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not delete campaign." },
      { status: 500 }
    );
  }
}
