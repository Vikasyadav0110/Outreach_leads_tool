import { NextResponse } from "next/server";
import { getLead, getCampaignV2, setEngagement } from "@/lib/db";
import { STATUS_KEYS } from "@/app/components/status";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

// Lead-scoped engagement update — used by the "Today" workspace, where the lead
// (not the campaign) is the thing in hand. Body carries which campaign link to
// update. Delegates to setEngagement, which syncs the global lead lifecycle,
// stamps last_touch_at, runs follow-up-task automation, and activates the campaign.
export const POST = apiHandler(async (req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const leadId = Number(params.id);
  if (!getLead(leadId)) throw new ApiError("Lead not found.", 404);
  const { campaignId, engagement, deal } = await req.json();
  if (!campaignId) throw new ApiError("campaignId is required.", 400);
  if (!getCampaignV2(Number(campaignId))) throw new ApiError("Campaign not found.", 404);
  if (engagement != null && !STATUS_KEYS.includes(engagement)) {
    throw new ApiError("Invalid engagement.", 400);
  }
  const campaign = setEngagement(Number(campaignId), leadId, { engagement, deal });
  return NextResponse.json({ campaign });
});
