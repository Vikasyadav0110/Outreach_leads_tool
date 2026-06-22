import { NextResponse } from "next/server";
import { runQualify } from "@/lib/agents";
import { enrichCard } from "@/lib/enrich";
import { getLead, setLeadQualified, addUsage } from "@/lib/db";
import { resetUsage, getUsage } from "@/lib/anthropic";
import { getActiveModule } from "@/lib/activeModule";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";
export const maxDuration = 300;

// Qualify ONLY the selected leads (no messaging). Runs the qualifier per lead,
// then enriches blank contacts (verified-only), writes the card onto the lead,
// and sets status 'qualified'. Leaves all other leads untouched.
export const POST = apiHandler(async (req) => {
  const denied = await requireApiAuth();
  if (denied) return denied;

  const { leadIds } = await req.json();
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    throw new ApiError("Select at least one lead to qualify.", 400);
  }
  const module = getActiveModule();
  const domain = module === "international" ? "international" : "local";

  resetUsage();
  let qualified = 0;
  let skipped = 0;
  for (const id of leadIds) {
    const lead = getLead(id);
    if (!lead) continue;
    if (lead.suppressed) { skipped++; continue; } // do-not-contact: no AI spend
    // Qualifier expects a lead shaped like a discovery lead.
    const cards = await runQualify({
      domain,
      highLeads: [{ name: lead.name, category: lead.niche, city: lead.city, website: lead.website, score: lead.score, gap: lead.gap }],
      module,
      leadId: id,
      source: lead.source,
    });
    let card = (cards || [])[0];
    if (!card) continue;
    card = await enrichCard(card, lead, module);
    setLeadQualified(id, card);
    qualified++;
  }
  addUsage(null, getUsage());

  return NextResponse.json({ qualified, skipped });
});
