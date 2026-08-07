import { NextResponse } from "next/server";
import { upsertLeadByIdentity } from "@/lib/db";
import { getActiveModule } from "@/lib/activeModule";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

const SOURCE = "LinkedIn Sales Navigator";
const clean = (v) => (v == null ? "" : String(v).trim());

// Bulk-import leads the user pulled from LinkedIn Sales Navigator / Premium
// (ToS-safe: the user does the finding; we just ingest their CSV). Each row is
// upserted into the normalized Leads hub — dedupe by identity, tagged source,
// only-empty fills, 'found' event logged. NEVER fabricates a contact: a value
// is stored only if the user provided it.
export const POST = apiHandler(async (req) => {
  const denied = await requireApiAuth();
  if (denied) return denied;

  const { rows } = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ApiError("No rows to import.", 400);
  }
  const module = getActiveModule();

  let added = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const name = clean(r.name);
    if (!name) { skipped++; continue; } // a lead needs a company/person name

    const email = clean(r.email);
    const whatsapp = clean(r.whatsapp);
    const decisionMaker = clean(r.decisionMaker);
    const linkedin = clean(r.linkedin);
    const title = clean(r.title);
    const signal = clean(r.signal);
    // Build a card ONLY from provided values — a real contact pre-qualifies the
    // lead; a bare company stays 'new' with no fabricated email/phone.
    const hasContact = email || whatsapp || decisionMaker || linkedin;
    const card = hasContact
      ? {
          name,
          exactGap: signal,
          decisionMaker,
          email,
          whatsapp,
          linkedin,
          title,
          personalizationHook: signal ? `LinkedIn signal: ${signal}` : "",
          contactSource: SOURCE,
        }
      : null;

    const scoreNum = Number(r.score);
    const { created } = upsertLeadByIdentity({
      name,
      module,
      city: clean(r.city),
      niche: clean(r.niche),
      source: SOURCE,
      website: clean(r.website),
      score: Number.isFinite(scoreNum) && scoreNum > 0 ? scoreNum : null,
      gap: signal,
      card,
    });
    if (created) added++; else updated++;
  }

  return NextResponse.json({ added, updated, skipped });
});
