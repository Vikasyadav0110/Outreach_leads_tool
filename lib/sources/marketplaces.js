// Pipeline B (sell) — the ADVANCED "demand" source. These are CLIENTS (buyers)
// who publicly post that they need someone to build their product (Upwork
// project posts / RFP & tender boards). Intent is explicit, so these convert
// best — the buyer has already said "we need this built". NOTE: this finds the
// clients/projects to sell; it does NOT find the IT delivery partners — those
// you bring yourself.
import { sleep, rand, pick, slugDomain } from "./util";

const COMPANIES = ["Brightline", "FreshCart", "MedSync", "PayNest", "RouteIQ", "EduSpark", "TrueNorth", "Cliniqo", "ShopWave", "FleetGo", "Verde", "Lendly"];
const SUFFIX = ["Inc", "Group", "Labs", "Co", "Health", "Retail", "Fintech"];
const NEEDS = [
  ["a React Native mobile app", 40, 80],
  ["a custom CRM + integrations", 60, 120],
  ["a cloud migration (AWS)", 50, 150],
  ["an AI chatbot / RAG pipeline", 35, 90],
  ["an e-commerce rebuild", 45, 100],
  ["a data warehouse + dashboards", 55, 130],
];
const FIRST = ["Jordan", "Aisha", "Wei", "Diego", "Hana", "Ravi", "Emma", "Yusuf", "Lena", "Kabir"];
const LAST = ["Brooks", "Iyer", "Zhang", "Garcia", "Park", "Mehta", "Wright", "Aziz", "Novak", "Bose"];

function mockLead(term, location) {
  const name = `${pick(COMPANIES)} ${pick(SUFFIX)}`;
  const contact = `${pick(FIRST)} ${pick(LAST)}`;
  const domain = `${slugDomain(name)}.com`;
  const [need, lo, hi] = pick(NEEDS);
  const budget = rand(lo, hi);
  return {
    name,
    website: `https://${domain}`,
    category: term ? term : "Software project",
    city: location || "",
    country: "",
    contact,
    title: pick(["Founder", "Head of Product", "COO", "CTO"]),
    email: `${contact.split(" ")[0].toLowerCase()}@${domain}`,
    signal: `Posted: needs ${need} · ~$${budget}k budget`,
    score: rand(8, 10),
    raw: { mock: true },
  };
}

export default {
  id: "marketplaces",
  label: "Project requests (demand)",
  pipeline: "sell",
  description: "Companies posting projects / RFPs that need development built (Upwork, RFP boards). These are the clients you sell — highest intent.",
  requiresKey: "MARKETPLACE_API_KEY",
  ready: () => !!process.env.MARKETPLACE_API_KEY,

  async *fetch({ term, location, limit = 12 }) {
    // Real integration point: pull active project posts / vendor searches from
    // Upwork API, licensed Clutch/GoodFirms feeds, or RFP/tender portals here.
    for (let i = 0; i < limit; i++) {
      await sleep(rand(220, 420));
      yield mockLead(term, location);
    }
  },
};
