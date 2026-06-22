import { NextResponse } from "next/server";
import { getCampaignV2, setEngagement } from "@/lib/db";
import { STATUS_KEYS } from "@/app/components/status";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

// Set a lead's per-campaign engagement (Mark as sent / replied / meeting / …).
// Delegates to setEngagement, which syncs the global lead lifecycle, stamps
// last_touch_at, runs follow-up-task automation, and activates the campaign.
export const POST = apiHandler(async (req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  if (!getCampaignV2(id)) throw new ApiError("Campaign not found.", 404);
  const { leadId, engagement, deal } = await req.json();
  if (!leadId) throw new ApiError("leadId is required.", 400);
  if (engagement != null && !STATUS_KEYS.includes(engagement)) {
    throw new ApiError("Invalid engagement.", 400);
  }
  const campaign = setEngagement(id, Number(leadId), { engagement, deal });
  return NextResponse.json({ campaign });
});
