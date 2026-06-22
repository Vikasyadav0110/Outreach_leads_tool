import { NextResponse } from "next/server";
import { getCampaignV2, deleteCampaignV2, setCampaignSequence } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

export const GET = apiHandler(async (_req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const campaign = getCampaignV2(Number(params.id));
  if (!campaign) throw new ApiError("Campaign not found.", 404);
  return NextResponse.json({ campaign });
});

// Attach / detach a follow-up cadence: { sequenceId: number | null }.
export const PATCH = apiHandler(async (req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  if (!getCampaignV2(id)) throw new ApiError("Campaign not found.", 404);
  const { sequenceId } = await req.json();
  const campaign = setCampaignSequence(id, sequenceId != null ? Number(sequenceId) : null);
  return NextResponse.json({ campaign });
});

export const DELETE = apiHandler(async (_req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  if (!getCampaignV2(id)) throw new ApiError("Campaign not found.", 404);
  deleteCampaignV2(id); // campaign_leads cascade; leads stay (reusable)
  return NextResponse.json({ ok: true });
});
