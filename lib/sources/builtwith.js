// Pipeline B (sell) — BuiltWith: companies running a target tech stack (good for
// migration/modernization pitches). Real path hits BuiltWith Lists API; mock
// fallback until BUILTWITH_API_KEY.
import { sleep, rand, pick, slugDomain, titleCase } from "./util";
import { scoreSellLead } from "../score";

const NAMES = ["Vertex", "Pinnacle", "Beacon", "Summit", "Catalyst", "Horizon", "Keystone", "Onyx", "Pulse", "Relay", "Sage", "Tide"];
const SUFFIX = ["Commerce", "Retail", "Media", "Group", "Digital", "Labs"];
const STACKS = ["WordPress (legacy)", "Magento 1", "jQuery / no SPA", "On-prem PHP", "Legacy .NET", "Shopify (basic)"];

function mockLead({ term, location, tech }) {
  const name = `${pick(NAMES)} ${pick(SUFFIX)}`;
  const domain = `${slugDomain(name)}.com`;
  const stack = tech ? titleCase(tech) : pick(STACKS);
  return {
    name,
    website: `https://${domain}`,
    category: titleCase(term) || "Tech-stack match",
    city: titleCase(location) || "",
    signal: `Running ${stack} — modernization fit`,
    score: scoreSellLead({ techMatch: true, employees: rand(50, 300) }),
    raw: { mock: true },
  };
}

export default {
  id: "builtwith",
  label: "BuiltWith (tech stack)",
  pipeline: "sell",
  description: "Companies on a target/outdated tech stack — modernization & rebuild prospects.",
  requiresKey: "BUILTWITH_API_KEY",
  ready: () => !!process.env.BUILTWITH_API_KEY,

  async *fetch({ term, location, limit = 12, tech }) {
    const key = process.env.BUILTWITH_API_KEY;

    // ---- Real path (BuiltWith Lists API) ----
    if (key) {
      const techName = (tech || term || "Shopify").trim();
      const res = await fetch(
        `https://api.builtwith.com/lists11/api.json?KEY=${key}&TECH=${encodeURIComponent(techName)}`
      );
      if (!res.ok) throw new Error(`BuiltWith API ${res.status}`);
      const data = await res.json();
      for (const r of (data.Results || []).slice(0, limit)) {
        yield {
          name: r.D || r.Domain,
          website: r.D ? `https://${r.D}` : null,
          category: techName,
          city: titleCase(location),
          signal: `Running ${techName}`,
          score: scoreSellLead({ techMatch: true }),
          raw: r,
        };
      }
      return;
    }

    // ---- Mock fallback ----
    for (let i = 0; i < limit; i++) {
      await sleep(rand(180, 360));
      yield mockLead({ term, location, tech });
    }
  },
};
