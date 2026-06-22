import { NextResponse } from "next/server";
import {
  createCampaignV2,
  upsertLeadByIdentity,
  addLeadsToCampaign,
  getCampaignV2,
  listCampaignsV2,
} from "@/lib/db";
import { isValidDomain } from "@/lib/prompts";
import { requireApiAuth } from "@/lib/authGuard";
import { getActiveModule } from "@/lib/activeModule";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    return NextResponse.json({ campaigns: listCampaignsV2(getActiveModule()) });
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
    const payload = await req.json();
    // NEW model: create an empty named campaign (leads added separately).
    if (payload.name != null && payload.domain == null) {
      const campaign = createCampaignV2({
        module: getActiveModule(),
        name: String(payload.name).trim() || "New campaign",
        channel: ["email", "whatsapp", "call", "multi"].includes(payload.channel) ? payload.channel : "multi",
      });
      return NextResponse.json({ campaign });
    }

    const { domain, city, niche, business, leads } = payload;
    if (!isValidDomain(domain)) {
      return NextResponse.json({ error: "Pick a valid domain." }, { status: 400 });
    }
    if (!city?.trim() || !niche?.trim()) {
      return NextResponse.json(
        { error: "City and niche are required." },
        { status: 400 }
      );
    }
    const module = getActiveModule();

    // Normalize the seed input: a single `business` OR a `leads` array (bulk
    // push from Sources). Both seed the campaign and skip Agent 1 (discovery).
    const seeds = Array.isArray(leads) && leads.length
      ? leads
      : business?.name?.trim()
        ? [business]
        : null;

    if (seeds) {
      // Push from Sources → normalized model: upsert each sourced business into
      // the leads hub (carrying its real phone/email as a pre-filled card so it's
      // immediately contactable), create a campaign, and link them.
      const campaign = createCampaignV2({ module, name: `${niche.trim()} · ${city.trim()}`, channel: "multi" });
      const leadIds = [];
      for (const b of seeds) {
        const name = (b.name || "").trim();
        if (!name) continue;
        const gap = (b.gap || b.signal || "Digital presence to be assessed").trim();
        const hasContact = (b.phone || b.email || b.contact);
        const { id } = upsertLeadByIdentity({
          name,
          module,
          city: (b.city || city).trim(),
          niche: niche.trim(),
          domain,
          website: (b.website || "").trim(),
          score: Number.isFinite(b.score) ? b.score : 8,
          priority: "HIGH",
          gap,
          phone: b.phone || "",
          // A real sourced contact pre-qualifies the lead (card present).
          card: hasContact
            ? {
                name,
                exactGap: gap,
                decisionMaker: (b.contact || "").trim(),
                whatsapp: (b.phone || "").toString().trim(),
                email: (b.email || "").toString().trim(),
                personalizationHook: b.signal ? `Sourced signal: ${b.signal}` : "",
                serviceTag: "Website + Google Business setup",
              }
            : null,
        });
        leadIds.push(id);
      }
      const added = addLeadsToCampaign(campaign.id, leadIds);
      return NextResponse.json({ campaign: getCampaignV2(campaign.id), seeded: added });
    }

    // Empty campaign (legacy specific-business mode w/o leads) → just create v2.
    const campaign = createCampaignV2({ module, name: `${niche.trim()} · ${city.trim()}`, channel: "multi" });
    return NextResponse.json({ campaign });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not create campaign." },
      { status: 500 }
    );
  }
}
