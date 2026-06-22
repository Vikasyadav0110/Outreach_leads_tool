import { NextResponse } from "next/server";
import { enrichContact } from "@/lib/enrich";
import { getLead, patchLead, setLeadQualified, addUsage } from "@/lib/db";
import { resetUsage, getUsage } from "@/lib/anthropic";
import { getActiveModule } from "@/lib/activeModule";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";
export const maxDuration = 120;

// Per-lead "Find contact" (new model): look up the decision-maker's PUBLIC
// contact details and merge verified values onto the lead row.
export const POST = apiHandler(async (_req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  const lead = getLead(id);
  if (!lead) throw new ApiError("Lead not found.", 404);
  if (lead.suppressed) throw new ApiError("This lead is marked do-not-contact. Remove the suppression to look up contact details.", 403);

  resetUsage();
  const c = await enrichContact(
    { id, name: lead.name, website: lead.website, city: lead.city, signal: lead.gap, source: lead.source },
    { module: lead.module || getActiveModule() }
  );
  addUsage(null, getUsage());

  if (!c?.found) {
    return NextResponse.json({ lead: getLead(id), found: false });
  }
  // Merge verified-only into the lead's card fields; ensure it's marked qualified.
  const ok = (v) => v && v !== "Not found" && v !== "Unknown";
  setLeadQualified(id, {
    name: lead.name,
    exactGap: lead.card?.exactGap || lead.gap || "",
    decisionMaker: ok(lead.card?.decisionMaker) ? lead.card.decisionMaker : c.decisionMaker,
    email: ok(lead.card?.email) ? lead.card.email : c.email,
    whatsapp: ok(lead.card?.whatsapp) ? lead.card.whatsapp : c.phone,
    linkedin: lead.card?.linkedin || c.linkedin || "",
    serviceTag: lead.card?.serviceTag || "",
    contactSource: c.source || "",
  });
  return NextResponse.json({ lead: getLead(id), found: true, source: c.source });
});
