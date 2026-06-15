import { NextResponse } from "next/server";
import {
  createCampaign,
  createSeededCampaign,
  listCampaigns,
} from "@/lib/db";
import { isValidDomain } from "@/lib/prompts";
import { requireApiAuth } from "@/lib/authGuard";
import { getActiveModule } from "@/lib/activeModule";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    return NextResponse.json({ campaigns: listCampaigns(getActiveModule()) });
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
    const { domain, city, niche, business, leads } = await req.json();
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
      const leadRows = [];
      const cards = [];
      for (const b of seeds) {
        const name = (b.name || "").trim();
        if (!name) continue;
        const gap = (b.gap || b.signal || "Digital presence to be assessed").trim();
        leadRows.push({
          name,
          category: (b.category || niche).trim(),
          city: (b.city || city).trim(),
          website: (b.website || "").trim() || "none",
          score: Number.isFinite(b.score) ? b.score : 8,
          gap,
          source: b.source || "Sourced",
          priority: "HIGH",
        });
        // Pre-fill a qualification card so the REAL phone we sourced is
        // immediately usable for WhatsApp/Call without re-running Agent 2.
        // Numbers/emails carry through verbatim — we never fabricate them.
        cards.push({
          name,
          exactGap: gap,
          decisionMaker: (b.contact || "Unknown").trim(),
          whatsapp: (b.phone || "Not found").toString().trim(),
          email: (b.email || "Not found").toString().trim(),
          personalizationHook: b.signal ? `Sourced signal: ${b.signal}` : "",
          serviceTag: "Website + Google Business setup",
        });
      }
      // Atomic: campaign + leads + cards in one transaction (no half-built state).
      const seeded = createSeededCampaign({
        domain,
        city: city.trim(),
        niche: niche.trim(),
        module,
        leads: leadRows,
        cards,
      });
      return NextResponse.json({ campaign: seeded, seeded: leadRows.length });
    }

    const campaign = createCampaign({ domain, city: city.trim(), niche: niche.trim(), module });
    return NextResponse.json({ campaign });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not create campaign." },
      { status: 500 }
    );
  }
}
