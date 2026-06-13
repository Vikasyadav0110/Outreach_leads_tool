// Pipeline B (sell): companies hiring engineers — a fit/intent signal that they
// need build capacity. These become qualified meetings you sell to IT partners.
import { sleep, rand, pick, slugDomain } from "./util";

const COMPANIES = ["Northwind", "Lumen", "Cobalt", "Brightpath", "Vantage", "Helio", "Quanta", "Meridian", "Orbit", "Stride", "Kestrel", "Atlas"];
const SUFFIX = ["Labs", "Technologies", "Systems", "Digital", "AI", "Health", "Pay", "Logistics"];
const ROLES = ["3 React developers", "a senior backend engineer", "a DevOps lead", "2 data engineers", "a mobile (Flutter) team", "an ML engineer"];
const TITLES = ["CTO", "VP Engineering", "Head of Product", "Engineering Manager", "Director of Technology"];
const FIRST = ["Aarav", "Priya", "Daniel", "Sara", "Omar", "Mei", "Liam", "Noor", "Carlos", "Ananya"];
const LAST = ["Sharma", "Khan", "Patel", "Nguyen", "Silva", "Cohen", "Okafor", "Müller", "Rossi", "Tan"];

function mockLead(term, location) {
  const name = `${pick(COMPANIES)} ${pick(SUFFIX)}`;
  const contact = `${pick(FIRST)} ${pick(LAST)}`;
  const domain = `${slugDomain(name)}.com`;
  return {
    name,
    website: `https://${domain}`,
    category: term ? term : "Technology",
    city: location || "",
    country: "",
    contact,
    title: pick(TITLES),
    email: `${contact.split(" ")[0].toLowerCase()}@${domain}`,
    signal: `Hiring ${pick(ROLES)} — in-house gap`,
    score: rand(7, 9),
    raw: { mock: true },
  };
}

export default {
  id: "job-boards",
  label: "Job Boards (hiring signal)",
  pipeline: "sell",
  description: "Companies hiring engineers — they need build capacity. Sell as a partner meeting.",
  requiresKey: "JOBS_API_KEY",
  ready: () => !!process.env.JOBS_API_KEY,

  async *fetch({ term, location, limit = 12 }) {
    // Real integration point: query LinkedIn Jobs / Indeed / Wellfound via an
    // official API or licensed feed here when JOBS_API_KEY is set.
    for (let i = 0; i < limit; i++) {
      await sleep(rand(200, 400));
      yield mockLead(term, location);
    }
  },
};
