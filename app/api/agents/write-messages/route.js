import { NextResponse } from "next/server";
import { runWriteMessages } from "@/lib/agents";
import { isValidDomain } from "@/lib/prompts";
import {
  getCampaign,
  getSettings,
  saveAgentOutput,
  setStatus,
  setError,
  addUsage,
} from "@/lib/db";
import { resetUsage, getUsage } from "@/lib/anthropic";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  let campaignId;
  try {
    ({ campaignId } = await req.json());
    const campaign = getCampaign(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    if (!isValidDomain(campaign.domain)) {
      return NextResponse.json({ error: "Invalid domain." }, { status: 400 });
    }
    if (!Array.isArray(campaign.qualified) || campaign.qualified.length === 0) {
      return NextResponse.json(
        { error: "Run Agent 2 first — no qualified leads to write for." },
        { status: 400 }
      );
    }

    setStatus(campaignId, "writing");
    resetUsage();
    const profile = getSettings(); // sender profile injected into Agent 3 prompt
    const messages = await runWriteMessages({
      domain: campaign.domain,
      qualified: campaign.qualified,
      profile,
      module: campaign.module,
      campaignId,
    });

    saveAgentOutput(campaignId, "messages_json", messages);
    addUsage(campaignId, getUsage());
    setStatus(campaignId, "ready");
    return NextResponse.json({ messages });
  } catch (err) {
    const message = err?.message || "Agent 3 (Message Writer) failed.";
    if (campaignId) setError(campaignId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
