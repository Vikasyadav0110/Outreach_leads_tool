// Pipeline B (sell) — Apollo.io: search companies by ICP and return the
// decision-maker (name/title/email/LinkedIn). This is the key enterprise unlock.
// Real path hits Apollo's People Search; falls back to mock until APOLLO_API_KEY
// is set. Get a key (free tier) at https://www.apollo.io/.
import { sleep, rand, pick, slugDomain, titleCase } from "./util";
import { scoreSellLead } from "../score";

// Apollo free tier is very limited (~85 credits/month) and each returned person
// can cost a credit — so hard-cap results per run regardless of the UI count.
const APOLLO_MAX = 5;

const COMPANIES = ["Northwind", "Lumen", "Cobalt", "Brightpath", "Vantage", "Helio", "Quanta", "Meridian", "Orbit", "Stride", "Kestrel", "Atlas", "Nimbus", "Forge", "Aperture"];
const SUFFIX = ["Labs", "Technologies", "Systems", "Software", "AI", "Health", "Pay", "Cloud", "Data"];
const FIRST = ["Aarav", "Priya", "Daniel", "Sara", "Omar", "Mei", "Liam", "Noor", "Carlos", "Ananya", "Yuki", "Ethan"];
const LAST = ["Sharma", "Khan", "Patel", "Nguyen", "Silva", "Cohen", "Okafor", "Müller", "Rossi", "Tan", "Park", "Costa"];

function mockLead({ term, location, role }) {
  const name = `${pick(COMPANIES)} ${pick(SUFFIX)}`;
  const contact = `${pick(FIRST)} ${pick(LAST)}`;
  const domain = `${slugDomain(name)}.com`;
  const employees = rand(50, 800);
  const hiring = rand(0, 5);
  const fundedRecently = Math.random() < 0.5;
  const title = role ? titleCase(role) : pick(["CTO", "VP Engineering", "Head of Product", "Founder", "Director of Engineering"]);
  const bits = [];
  if (hiring) bits.push(`hiring ${hiring} engineer${hiring > 1 ? "s" : ""}`);
  if (fundedRecently) bits.push("recently funded");
  bits.push(`${employees} employees`);
  return {
    name,
    website: `https://${domain}`,
    category: titleCase(term) || "Technology",
    city: titleCase(location) || "",
    country: "",
    contact,
    title,
    email: `${contact.split(" ")[0].toLowerCase()}@${domain}`,
    signal: bits.join(" · "),
    score: scoreSellLead({ hiring, fundedRecently, employees }),
    raw: { mock: true },
  };
}

export default {
  id: "apollo",
  label: "Apollo.io (companies + contacts)",
  pipeline: "sell",
  description: "Companies by ICP (industry, size, geo, tech) with the decision-maker's email & LinkedIn.",
  requiresKey: "APOLLO_API_KEY",
  ready: () => !!process.env.APOLLO_API_KEY,

  async *fetch({ term, location, limit = 5, role, industry, tech, size }) {
    const key = process.env.APOLLO_API_KEY;
    const n = Math.min(limit, APOLLO_MAX); // cap to protect scarce free-tier credits

    // ---- Real path (Apollo People Search) ----
    if (key) {
      const body = {
        page: 1,
        per_page: n,
        ...(role ? { person_titles: [role] } : { person_titles: ["CTO", "VP Engineering", "Head of Engineering", "Founder"] }),
        ...(location ? { person_locations: [location] } : {}),
        ...(term || industry || tech
          ? { q_keywords: [term, industry, tech].filter(Boolean).join(" ") }
          : {}),
        ...(size ? { organization_num_employees_ranges: [size] } : {}),
      };
      const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": key },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        // Apollo's free plan blocks the search API entirely (not a credit issue).
        throw new Error(
          "Apollo's People Search needs a paid plan (free tier returns 403). Use AI Research or RemoteOK for International leads."
        );
      }
      if (!res.ok) throw new Error(`Apollo API ${res.status}`);
      const data = await res.json();
      for (const p of (data.people || []).slice(0, n)) {
        const org = p.organization || {};
        const employees = org.estimated_num_employees || 0;
        yield {
          name: org.name || p.name,
          website: org.website_url || null,
          category: org.industry || titleCase(term),
          city: p.city || titleCase(location),
          country: p.country || "",
          contact: p.name,
          title: p.title,
          email: p.email || null,
          signal: [org.industry, employees ? `${employees} employees` : null].filter(Boolean).join(" · ") || "Apollo match",
          score: scoreSellLead({ employees, techMatch: !!tech }),
          raw: { id: p.id, linkedin: p.linkedin_url },
        };
      }
      return;
    }

    // ---- Mock fallback (no key) ----
    for (let i = 0; i < n; i++) {
      await sleep(rand(180, 360));
      yield mockLead({ term, location, role });
    }
  },
};
