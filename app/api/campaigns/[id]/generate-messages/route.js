import { NextResponse } from "next/server";
import { runWriteMessages } from "@/lib/agents";
import { getCampaignV2, getSettings, saveCampaignLeadMessages, setCampaignV2Status, addUsage } from "@/lib/db";
import { resetUsage, getUsage } from "@/lib/anthropic";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";
export const maxDuration = 300;

// Generate outreach messages for the leads in this campaign (default: all linked;
// optional {leadIds} subset). Writes per-lead messages into campaign_leads.
export const POST = apiHandler(async (req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  const campaign = getCampaignV2(id);
  if (!campaign) throw new ApiError("Campaign not found.", 404);

  const body = await req.json().catch(() => ({}));
  const onlyIds = Array.isArray(body.leadIds) && body.leadIds.length ? new Set(body.leadIds) : null;
  // Members that have a qualification card (needed to write a good message).
  const targets = campaign.members.filter((m) => m.card && (!onlyIds || onlyIds.has(m.id)));
  if (targets.length === 0) {
    throw new ApiError("No qualified leads to generate messages for.", 400);
  }

  const domain = campaign.module === "international" ? "international" : "local";
  const profile = getSettings();
  resetUsage();
  const msgs = await runWriteMessages({
    domain,
    qualified: targets.map((m) => m.card),
    profile,
    module: campaign.module,
  });
  // Match generated messages back to leads by name (same convention as before).
  const byName = {};
  for (const m of msgs || []) if (m?.name) byName[m.name.trim().toLowerCase()] = m;
  let written = 0;
  for (const m of targets) {
    const msg = byName[(m.name || "").trim().toLowerCase()];
    if (!msg) continue;
    saveCampaignLeadMessages(id, m.id, msg);
    written++;
  }
  addUsage(null, getUsage());
  setCampaignV2Status(id, "messages_ready");

  return NextResponse.json({ written, campaign: getCampaignV2(id) });
});
