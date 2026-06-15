// Pipeline B (sell) — Crunchbase: recently-funded companies (budget signal).
// Real path hits Crunchbase's search API; mock fallback until CRUNCHBASE_API_KEY.
import { sleep, rand, pick, slugDomain, titleCase } from "./util";
import { scoreSellLead } from "../score";

const NAMES = ["Brightline", "FreshCart", "MedSync", "PayNest", "RouteIQ", "EduSpark", "TrueNorth", "Cliniqo", "ShopWave", "FleetGo", "Verde", "Lendly", "Stacked", "Cohere"];
const SUFFIX = ["Inc", "Labs", "AI", "Health", "Fintech", "Technologies"];
const ROUNDS = ["Seed", "Series A", "Series B", "Series C"];

function mockLead({ term, location }) {
  const name = `${pick(NAMES)} ${pick(SUFFIX)}`;
  const domain = `${slugDomain(name)}.com`;
  const round = pick(ROUNDS);
  const raised = rand(2, 60);
  const employees = rand(20, 400);
  return {
    name,
    website: `https://${domain}`,
    category: titleCase(term) || "Startup",
    city: titleCase(location) || "",
    country: "",
    signal: `${round} · raised $${raised}M · ${employees} employees`,
    score: scoreSellLead({ fundedRecently: true, budgetK: raised * 1000, employees }),
    raw: { mock: true },
  };
}

export default {
  id: "crunchbase",
  label: "Crunchbase (funded companies)",
  pipeline: "sell",
  description: "Recently-funded companies that have budget for a build. Pair with enrichment for contacts.",
  requiresKey: "CRUNCHBASE_API_KEY",
  ready: () => !!process.env.CRUNCHBASE_API_KEY,

  async *fetch({ term, location, limit = 12 }) {
    const key = process.env.CRUNCHBASE_API_KEY;

    // ---- Real path (Crunchbase search) ----
    if (key) {
      const res = await fetch("https://api.crunchbase.com/api/v4/searches/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-cb-user-key": key },
        body: JSON.stringify({
          field_ids: ["identifier", "website_url", "short_description", "location_identifiers", "num_employees_enum", "last_funding_type"],
          query: term ? [{ type: "predicate", field_id: "description", operator_id: "contains", values: [term] }] : [],
          limit: Math.min(limit, 50),
        }),
      });
      if (!res.ok) throw new Error(`Crunchbase API ${res.status}`);
      const data = await res.json();
      for (const e of (data.entities || []).slice(0, limit)) {
        const p = e.properties || {};
        yield {
          name: p.identifier?.value || "Company",
          website: p.website_url || null,
          category: titleCase(term) || "Startup",
          city: titleCase(location),
          signal: [p.last_funding_type, p.num_employees_enum].filter(Boolean).join(" · ") || "Funded",
          score: scoreSellLead({ fundedRecently: true }),
          raw: e,
        };
      }
      return;
    }

    // ---- Mock fallback ----
    for (let i = 0; i < limit; i++) {
      await sleep(rand(180, 360));
      yield mockLead({ term, location });
    }
  },
};
