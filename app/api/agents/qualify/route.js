import { NextResponse } from "next/server";
import { runQualify } from "@/lib/agents";
import { isValidDomain } from "@/lib/prompts";
import { getCampaign, saveAgentOutput, setStatus, setError, addUsage } from "@/lib/db";
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
    if (!Array.isArray(campaign.leads)) {
      return NextResponse.json(
        { error: "Run Agent 1 first — no leads to qualify." },
        { status: 400 }
      );
    }

    // Prefer HIGH-priority leads; if none scored >= 7, fall back to the
    // best-scoring leads so the pipeline never dead-ends.
    let toQualify = campaign.leads.filter((l) => l.priority === "HIGH");
    if (toQualify.length === 0) {
      toQualify = [...campaign.leads]
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
        .slice(0, 6);
    }
    if (toQualify.length === 0) {
      return NextResponse.json(
        { error: "No leads to qualify — run Agent 1 first." },
        { status: 400 }
      );
    }

    setStatus(campaignId, "qualifying");
    resetUsage();
    const cards = await runQualify({ domain: campaign.domain, highLeads: toQualify });

    saveAgentOutput(campaignId, "qualified_json", cards);
    addUsage(campaignId, getUsage());
    setStatus(campaignId, "qualified");
    return NextResponse.json({ qualified: cards });
  } catch (err) {
    const message = err?.message || "Agent 2 (Qualifier) failed.";
    if (campaignId) setError(campaignId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
