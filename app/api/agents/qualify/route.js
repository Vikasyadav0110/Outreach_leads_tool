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
    let leadName;
    ({ campaignId, leadName } = await req.json());
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

    // Single-lead mode: qualify ONE named lead (manual "promote") and MERGE its
    // card into the existing set — so a NORMAL (<7) lead can be made contactable
    // without re-running the whole batch or losing existing cards.
    const single = typeof leadName === "string" && leadName.trim();
    let toQualify;
    if (single) {
      const lead = campaign.leads.find(
        (l) => (l.name || "").trim().toLowerCase() === leadName.trim().toLowerCase()
      );
      if (!lead) {
        return NextResponse.json({ error: "Lead not found in this campaign." }, { status: 404 });
      }
      toQualify = [lead];
    } else {
      // Batch mode: prefer HIGH-priority leads; fall back to the best-scoring so
      // the pipeline never dead-ends.
      toQualify = campaign.leads.filter((l) => l.priority === "HIGH");
      if (toQualify.length === 0) {
        toQualify = [...campaign.leads]
          .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
          .slice(0, 6);
      }
    }
    if (toQualify.length === 0) {
      return NextResponse.json(
        { error: "No leads to qualify — run Agent 1 first." },
        { status: 400 }
      );
    }

    if (!single) setStatus(campaignId, "qualifying");
    resetUsage();
    const newCards = await runQualify({ domain: campaign.domain, highLeads: toQualify, module: campaign.module, campaignId });

    // Merge: keep existing cards, replace/add the ones we just produced (by name).
    let cards = newCards;
    if (single) {
      const existing = Array.isArray(campaign.qualified) ? campaign.qualified : [];
      const newNames = new Set(newCards.map((c) => (c.name || "").trim().toLowerCase()));
      cards = [...existing.filter((c) => !newNames.has((c.name || "").trim().toLowerCase())), ...newCards];
    }

    saveAgentOutput(campaignId, "qualified_json", cards);
    addUsage(campaignId, getUsage());
    // Only advance the campaign status in batch mode; a single promote shouldn't
    // regress a campaign that's already further along (e.g. "ready").
    if (!single) setStatus(campaignId, "qualified");
    return NextResponse.json({ qualified: cards, newCards });
  } catch (err) {
    const message = err?.message || "Agent 2 (Qualifier) failed.";
    if (campaignId) setError(campaignId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
