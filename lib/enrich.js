// Contact enrichment: find the decision-maker + PUBLIC contact details for a
// lead. Tries providers in order and keeps the first VERIFIED value per field.
// Never fabricates or pattern-guesses — unknowns stay empty. Each provider is
// best-effort: a failure/skip falls through to the next, never throws to caller.
import { getClient, providerForTask, beginCall, MODELS, isMockMode } from "./anthropic";
import { parseJsonLoose } from "./agents";
import { enrichContactPrompt, enrichSchema } from "./prompts";

const EMPTY = { decisionMaker: "", title: "", email: "", phone: "", linkedin: "", source: "", found: false };

const isEmail = (s) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
const clean = (s) => (typeof s === "string" ? s.trim() : "");

function joinText(content) {
  return (content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

function domainOf(website) {
  if (!website) return "";
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Which enrichers are usable right now (booleans only — for the UI).
export function enrichProviderStatus() {
  return {
    aiSearch: !isMockMode(providerForTask("enrich")),
    hunter: !!process.env.HUNTER_API_KEY,
    apollo: !!process.env.APOLLO_API_KEY,
  };
}

// 1) AI web-search — the default, ~free, works for any org incl. govt/private.
async function viaAiSearch(lead, { module }) {
  const prefer = providerForTask("enrich");
  if (isMockMode(prefer)) return null;
  const client = getClient(prefer);
  beginCall({ task: "enrich", campaignId: lead.campaignId ?? null, leadId: lead.id ?? lead.leadId ?? null, source: lead.source ?? null, module });
  const userMsg = `Organization: ${lead.name}${lead.website ? ` (${lead.website})` : ""}${
    lead.city ? ` — ${lead.city}` : ""
  }${lead.signal ? `\nContext: ${lead.signal}` : ""}\n\nFind the decision-maker + their public contact details. Return ONLY the JSON object.`;
  const stream = client.messages.stream({
    model: MODELS.qualify,
    max_tokens: 1500,
    system: enrichContactPrompt(module),
    messages: [{ role: "user", content: userMsg }],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") return null;
  let d;
  try {
    d = parseJsonLoose(joinText(message.content));
  } catch {
    return null;
  }
  return {
    decisionMaker: clean(d.decisionMaker),
    title: clean(d.title),
    email: isEmail(d.email) ? clean(d.email) : "", // accept only valid-shaped emails
    phone: clean(d.phone),
    linkedin: clean(d.linkedin),
    source: "web search",
  };
}

// 2) Hunter.io — verified work emails. If we already know a decision-maker's
// name (e.g. from AI search), use Email Finder to get THAT person's email
// precisely; otherwise use Domain Search and pick the best-confidence contact.
// Only accept emails Hunter verifies as valid/accept-all with confidence ≥ 70.
const HUNTER_MIN_CONFIDENCE = 70;

async function viaHunter(lead, known = {}) {
  const key = process.env.HUNTER_API_KEY;
  const domain = domainOf(lead.website);
  if (!key || !domain) return null;
  try {
    // --- Email Finder (precise) when we have a person's name ---
    const name = clean(known.decisionMaker);
    if (name && name !== "Unknown") {
      const u = new URL("https://api.hunter.io/v2/email-finder");
      u.searchParams.set("domain", domain);
      u.searchParams.set("full_name", name);
      u.searchParams.set("api_key", key);
      const res = await fetch(u);
      if (res.ok) {
        const d = (await res.json())?.data || {};
        const verifyOk = !d.verification || ["valid", "accept_all"].includes(d.verification.status);
        if (isEmail(d.email) && (d.confidence ?? 0) >= HUNTER_MIN_CONFIDENCE && verifyOk) {
          return {
            decisionMaker: name,
            title: clean(d.position),
            email: clean(d.email),
            phone: "",
            linkedin: clean(d.linkedin_url || d.linkedin),
            source: "Hunter.io",
          };
        }
      }
    }

    // --- Domain Search (fallback) — best-confidence person over a role inbox ---
    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${key}`
    );
    if (!res.ok) return null;
    const emails = (await res.json())?.data?.emails || [];
    const best =
      emails
        .filter((e) => isEmail(e.value) && (e.confidence ?? 0) >= HUNTER_MIN_CONFIDENCE)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] || null;
    if (!best) return null;
    const person = [best.first_name, best.last_name].filter(Boolean).join(" ");
    return {
      decisionMaker: clean(person),
      title: clean(best.position),
      email: clean(best.value),
      phone: clean(best.phone_number),
      linkedin: clean(best.linkedin),
      source: "Hunter.io",
    };
  } catch {
    return null;
  }
}

// 3) Apollo people-search — company → decision-maker (free tier 403s; skip then).
async function viaApollo(lead) {
  const key = process.env.APOLLO_API_KEY;
  const domain = domainOf(lead.website);
  if (!key || !domain) return null;
  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": key },
      body: JSON.stringify({
        page: 1,
        per_page: 1,
        q_organization_domains: domain,
        person_titles: ["CTO", "VP Engineering", "Head of Engineering", "Founder", "Director"],
      }),
    });
    if (!res.ok) return null; // 403 on free tier → silently skip
    const data = await res.json();
    const p = (data.people || [])[0];
    if (!p) return null;
    return {
      decisionMaker: clean(p.name),
      title: clean(p.title),
      email: isEmail(p.email) ? clean(p.email) : "",
      phone: "",
      linkedin: clean(p.linkedin_url),
      source: "Apollo",
    };
  } catch {
    return null;
  }
}

// Merge: fill empty fields from `add`; never overwrite an existing verified value.
function merge(base, add) {
  if (!add) return base;
  const out = { ...base };
  for (const f of ["decisionMaker", "title", "email", "phone", "linkedin"]) {
    if (!out[f] && add[f]) out[f] = add[f];
  }
  // Track which provider supplied the first contact channel we got.
  if (!base.source && add.source && (add.email || add.phone || add.linkedin || add.decisionMaker)) {
    out.source = add.source;
  }
  return out;
}

// Run the chain. Each provider receives what we've found so far (`acc`) so a
// later one can sharpen it (e.g. Hunter finds the email for a name AI found).
// Returns the merged contact (verified-only) + `found`/`source`.
export async function enrichContact(lead, { module } = {}) {
  let acc = { ...EMPTY };
  const providers = [
    (a) => viaAiSearch(lead, { module }),
    (a) => viaHunter(lead, a),
    (a) => viaApollo(lead),
  ];
  for (const run of providers) {
    // Stop early once we have a name AND a verified email — the best case.
    if (acc.decisionMaker && acc.email) break;
    let r = null;
    try {
      r = await run(acc);
    } catch {
      r = null;
    }
    acc = merge(acc, r);
  }
  acc.found = !!(acc.email || acc.phone || acc.linkedin || acc.decisionMaker);
  return acc;
}

// Fill blank contact fields on a qualification card by enriching from the lead.
// Verified-only; keeps any value the qualifier already found. Never throws.
// Shared by the campaign-qualify route and the leads-qualify route.
export async function enrichCard(card, lead, module) {
  const ok = (v) => v && v !== "Not found" && v !== "Unknown";
  if (ok(card?.email) || ok(card?.whatsapp)) return card;
  let c;
  try {
    c = await enrichContact(
      { id: lead?.id, name: card.name, website: lead?.website, city: lead?.city, signal: card?.personalizationHook, campaignId: lead?.campaignId, source: lead?.source },
      { module }
    );
  } catch {
    return card;
  }
  if (!c?.found) return card;
  const pick = (cur, next, bad) => (cur && cur !== bad ? cur : next || cur);
  return {
    ...card,
    decisionMaker: pick(card.decisionMaker, c.decisionMaker, "Unknown"),
    email: pick(card.email, c.email, "Not found"),
    whatsapp: pick(card.whatsapp, c.phone, "Not found"),
    linkedin: card.linkedin || c.linkedin || "",
    contactSource: c.source || "",
  };
}
