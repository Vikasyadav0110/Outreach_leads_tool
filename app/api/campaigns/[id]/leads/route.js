import { NextResponse } from "next/server";
import { getCampaignV2, addLeadsToCampaign } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

// Add leads (by id) to a campaign — the many-to-many link. Reusable: the same
// leads can be added to multiple campaigns.
export const POST = apiHandler(async (req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  if (!getCampaignV2(id)) throw new ApiError("Campaign not found.", 404);
  const { leadIds } = await req.json();
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    throw new ApiError("No leads provided.", 400);
  }
  const added = addLeadsToCampaign(id, leadIds.map(Number).filter(Boolean));
  return NextResponse.json({ added, campaign: getCampaignV2(id) });
});
