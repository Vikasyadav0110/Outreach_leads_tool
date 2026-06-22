import { NextResponse } from "next/server";
import { runFindLeads } from "@/lib/agents";
import { isValidDomain } from "@/lib/prompts";
import { upsertLeadByIdentity } from "@/lib/db";
import { resetUsage, getUsage } from "@/lib/anthropic";
import { addUsage } from "@/lib/db";
import { getActiveModule } from "@/lib/activeModule";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";
export const maxDuration = 300;

// Find leads ONLY (no qualify, no messages) and store them in the leads hub as
// status 'new'. Re-running dedupes by identity (module|name|city), so this also
// serves as "find more". This is the Leads-page "Find New Leads" action.
export const POST = apiHandler(async (req) => {
  const denied = await requireApiAuth();
  if (denied) return denied;

  const body = await req.json();
  const module = getActiveModule();
  const domain = body.domain || (module === "international" ? "international" : "local");
  const city = (body.city || "").trim();
  const niche = (body.niche || "").trim();
  if (!isValidDomain(domain)) throw new ApiError("Pick a valid domain.", 400);
  if (!city || !niche) throw new ApiError("City and niche are required.", 400);

  resetUsage();
  const leads = await runFindLeads({ domain, city, niche, module, campaignId: null });

  let added = 0;
  let updated = 0;
  for (const l of leads || []) {
    if (!l?.name) continue;
    const { created } = upsertLeadByIdentity({ ...l, module, niche, city: l.city || city, domain });
    created ? added++ : updated++;
  }
  addUsage(null, getUsage());

  return NextResponse.json({ found: (leads || []).length, added, updated });
});
