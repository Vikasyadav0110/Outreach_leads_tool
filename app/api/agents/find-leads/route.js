import { NextResponse } from "next/server";
import { runFindLeads } from "@/lib/agents";
import { isValidDomain } from "@/lib/prompts";
import { getCampaign, saveAgentOutput, setStatus, setError, addUsage } from "@/lib/db";
import { resetUsage, getUsage } from "@/lib/anthropic";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";
export const maxDuration = 300; // lead research can take a while

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

    setStatus(campaignId, "finding");
    resetUsage();
    const leads = await runFindLeads({
      domain: campaign.domain,
      city: campaign.city,
      niche: campaign.niche,
    });

    saveAgentOutput(campaignId, "leads_json", leads);
    addUsage(campaignId, getUsage());
    setStatus(campaignId, "found");
    return NextResponse.json({ leads });
  } catch (err) {
    const message = err?.message || "Agent 1 (Lead Finder) failed.";
    if (campaignId) setError(campaignId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
