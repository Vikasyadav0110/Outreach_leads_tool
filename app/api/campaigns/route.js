import { NextResponse } from "next/server";
import {
  createCampaign,
  listCampaigns,
  getCampaign,
  saveAgentOutput,
  setStatus,
} from "@/lib/db";
import { isValidDomain } from "@/lib/prompts";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    return NextResponse.json({ campaigns: listCampaigns() });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not load campaigns." },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { domain, city, niche, business } = await req.json();
    if (!isValidDomain(domain)) {
      return NextResponse.json({ error: "Pick a valid domain." }, { status: 400 });
    }
    if (!city?.trim() || !niche?.trim()) {
      return NextResponse.json(
        { error: "City and niche are required." },
        { status: 400 }
      );
    }
    const campaign = createCampaign({
      domain,
      city: city.trim(),
      niche: niche.trim(),
    });

    // "Specific business" mode: seed the campaign with the given business as a
    // HIGH-priority lead and skip Agent 1 (lead discovery) entirely.
    if (business?.name?.trim()) {
      const lead = {
        name: business.name.trim(),
        category: (business.category || niche).trim(),
        city: city.trim(),
        website: (business.website || "").trim() || "none",
        score: 8,
        gap: (business.gap || "Digital presence to be assessed").trim(),
        source: "Added manually",
        priority: "HIGH",
      };
      saveAgentOutput(campaign.id, "leads_json", [lead]);
      setStatus(campaign.id, "found");
      return NextResponse.json({ campaign: getCampaign(campaign.id) });
    }

    return NextResponse.json({ campaign });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not create campaign." },
      { status: 500 }
    );
  }
}
