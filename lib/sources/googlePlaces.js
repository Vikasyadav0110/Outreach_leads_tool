// Pipeline A (deliver): local SMBs by niche + city. The website gap IS the
// qualifier — a business with no site is a perfect target for your team.
import { sleep, rand, pick, slugDomain, titleCase } from "./util";

const SUFFIXES = ["Services", "& Sons", "Solutions", "Hub", "Co.", "Enterprises", "Studio", "Works"];
const PREFIXES = ["Royal", "Sri", "New", "Star", "Prime", "Green", "Urban", "Classic", "Metro", "Apex"];

function mockLead(term, location) {
  const name = `${pick(PREFIXES)} ${titleCase(term) || "Local"} ${pick(SUFFIXES)}`;
  // ~65% have no website (the gap), ~35% have an outdated one.
  const hasSite = Math.random() < 0.35;
  const website = hasSite ? `http://${slugDomain(name)}.in` : null;
  const signal = hasSite ? "Outdated website (no SSL, mobile-broken)" : "No website";
  const score = hasSite ? rand(6, 7) : rand(8, 10);
  return {
    name,
    website,
    category: titleCase(term) || "Local business",
    city: titleCase(location) || "",
    country: "India",
    phone: `+91 ${rand(70, 99)}${rand(10000000, 99999999)}`,
    signal,
    score,
    raw: { mock: true },
  };
}

export default {
  id: "google-places",
  label: "Google Places",
  pipeline: "deliver",
  description: "Local SMBs by niche + city. Flags businesses with no/outdated website.",
  requiresKey: "GOOGLE_PLACES_API_KEY",
  ready: () => !!process.env.GOOGLE_PLACES_API_KEY,

  async *fetch({ term, location, limit = 12 }) {
    const key = process.env.GOOGLE_PLACES_API_KEY;

    // ---- Real path (runs only when a key is configured) ----
    if (key) {
      const q = `${term} in ${location}`.trim();
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${key}`
      );
      const data = await res.json();
      for (const p of (data.results || []).slice(0, limit)) {
        // Place Details gives the website field we need for gap detection.
        let website = null;
        try {
          const dres = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}&fields=website,formatted_phone_number&key=${key}`
          );
          const d = (await dres.json()).result || {};
          website = d.website || null;
          yield {
            name: p.name,
            website,
            category: titleCase(term),
            city: titleCase(location),
            country: "",
            phone: (await null, d.formatted_phone_number) || null,
            signal: website ? "Has website — review for gaps" : "No website",
            score: website ? 6 : 9,
            raw: p,
          };
        } catch {
          yield {
            name: p.name,
            website: null,
            category: titleCase(term),
            city: titleCase(location),
            signal: "No website",
            score: 9,
            raw: p,
          };
        }
      }
      return;
    }

    // ---- Mock fallback (no key): stream plausible leads with delays so the
    // realtime UI shows them arriving one by one. ----
    for (let i = 0; i < limit; i++) {
      await sleep(rand(180, 360));
      yield mockLead(term, location);
    }
  },
};
