// Pipeline B (sell) — USASpending.gov: FREE, no API key. Surfaces organizations
// that OUTSOURCE software/IT work by mining awarded US federal contracts under
// NAICS 541511 (custom computer programming). Each award reveals the awarding
// AGENCY (a repeat buyer of outsourced dev) and the RECIPIENT (a vendor doing
// the work — a competitor or potential delivery partner). A prior award is a
// strong budget + intent signal, so these score high.
import { sleep, rand, pick, titleCase } from "./util";
import { scoreSellLead } from "../score";

const DEFAULT_NAICS = "541511"; // custom computer programming services

const MOCK_AGENCIES = ["Department of Defense", "Dept. of Health & Human Services", "Department of Energy", "NASA", "Dept. of Veterans Affairs"];
const MOCK_VENDORS = ["Helix Systems Inc", "Vertex Software LLC", "BlueRiver Technologies", "Apex Digital Corp", "NorthBridge IT"];

function mockLead({ term }) {
  const agency = pick(MOCK_AGENCIES);
  const amount = rand(2, 400) * 1_000_000;
  return {
    name: agency,
    website: null,
    category: titleCase(term) || "Government / IT buyer",
    city: "",
    country: "USA",
    signal: `Awarded $${(amount / 1e6).toFixed(0)}M IT contract (NAICS 541511) — outsources software work`,
    score: scoreSellLead({ project: true, budgetK: amount / 1000 }),
    raw: { mock: true, vendor: pick(MOCK_VENDORS) },
  };
}

function fmtAmount(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

export default {
  id: "usaspending",
  label: "US Federal Contracts (USASpending · free)",
  pipeline: "sell",
  description: "FREE: US agencies & companies that AWARD software/IT contracts (NAICS 541511) — proven outsourcers. No API key.",
  requiresKey: null,
  ready: () => true,

  async *fetch({ term, naics, limit = 12 }) {
    const n = Math.min(limit, 25);
    const code = (naics || "").trim() || DEFAULT_NAICS;
    // Last ~2 years of awards.
    const end = new Date();
    const start = new Date(end.getTime() - 730 * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);

    const body = {
      filters: {
        award_type_codes: ["A", "B", "C", "D"],
        naics_codes: [code],
        time_period: [{ start_date: iso(start), end_date: iso(end) }],
        ...(term ? { keywords: [term] } : {}),
      },
      fields: ["Recipient Name", "Awarding Agency", "Award Amount", "Description", "naics_code"],
      limit: n,
      sort: "Award Amount",
      order: "desc",
    };

    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`USASpending API ${res.status}: ${t.slice(0, 160)}`);
    }
    const data = await res.json();
    const results = data.results || [];

    // Dedup agencies within this run (an agency appears across many awards) — we
    // surface the BUYER (agency) as the lead, with the award as the signal.
    const seen = new Set();
    for (const r of results) {
      const agency = r["Awarding Agency"];
      if (!agency || seen.has(agency)) continue;
      seen.add(agency);
      const amount = r["Award Amount"];
      const vendor = r["Recipient Name"];
      const desc = (r["Description"] || "").trim();
      yield {
        name: agency,
        website: null,
        category: "Government / enterprise IT buyer",
        city: "",
        country: "USA",
        contact: "",
        signal:
          `Awarded ${fmtAmount(amount)} software contract` +
          (vendor ? ` to ${titleCase(String(vendor).toLowerCase())}` : "") +
          (desc ? ` · ${desc.slice(0, 60)}` : ""),
        score: scoreSellLead({ project: true, budgetK: (Number(amount) || 0) / 1000 }),
        raw: { source: "usaspending", agency, vendor, amount, naics: r["naics_code"] },
      };
    }

    // If the live call returned nothing usable, fall back to a couple of mocks so
    // the run never dead-ends silently.
    if (seen.size === 0) {
      for (let i = 0; i < Math.min(n, 4); i++) {
        await sleep(rand(120, 240));
        yield mockLead({ term });
      }
    }
  },
};
