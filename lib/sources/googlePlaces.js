// Pipeline A (deliver): local SMBs by niche + city. The website gap IS the
// qualifier — a business with no site is a perfect target for your team.
import { titleCase } from "./util";

export default {
  id: "google-places",
  label: "Google Places",
  pipeline: "deliver",
  // Local-business directory → Local module only. (For International, use AI
  // Research / Apollo / RemoteOK, which target companies, not local listings.)
  description: "Local businesses by niche + city. Flags those with no/outdated website.",
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

    // ---- No key: yield NOTHING. We never fabricate businesses into the DB —
    // a lead with a real name/phone must come from the real Places API. With no
    // key, ready() is false and the UI tells the user to add GOOGLE_PLACES_API_KEY.
  },
};
