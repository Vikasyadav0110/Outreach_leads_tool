// Pipeline A (deliver) — OpenStreetMap: FREE local businesses by niche + city,
// no API key and no Google billing. Geocodes the city via Nominatim, then pulls
// named POIs (shops/amenities/crafts) via Overpass; flags those with no website.
import { titleCase } from "./util";

const UA = "OutreachPilot/1.0 (lead sourcing)";

async function geocode(location) {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`,
    { headers: { "User-Agent": UA } }
  );
  if (!r.ok) return null;
  const d = await r.json();
  const bb = d?.[0]?.boundingbox; // [south, north, west, east]
  if (!bb) return null;
  return { s: +bb[0], n: +bb[1], w: +bb[2], e: +bb[3] };
}

export default {
  id: "openstreetmap",
  label: "OpenStreetMap (free)",
  pipeline: "deliver",
  description: "Free local businesses by niche + city — no key, no Google billing. Flags those with no website.",
  requiresKey: null,
  ready: () => true,

  async *fetch({ term, location, limit = 12 }) {
    if (!location) throw new Error("OpenStreetMap needs a Location (city).");
    const box = await geocode(location);
    if (!box) throw new Error(`Could not locate "${location}".`);
    const { s, w, n, e } = box;
    const bbox = `${s},${w},${n},${e}`; // Overpass bbox = south,west,north,east
    const cap = Math.min(limit * 4, 120);

    // Filter server-side by the niche term (matches name OR category tag); if no
    // term, fall back to all named shops/amenities in the bbox.
    const esc = (term || "").replace(/[^a-z0-9 ]/gi, "").trim();
    const filt = esc
      ? `(node["name"~"${esc}",i](${bbox});node["amenity"~"${esc}",i](${bbox});node["shop"~"${esc}",i](${bbox});node["craft"~"${esc}",i](${bbox});node["cuisine"~"${esc}",i](${bbox}););`
      : `(node["name"]["amenity"](${bbox});node["name"]["shop"](${bbox}););`;
    const q = `[out:json][timeout:25];${filt}out body ${cap};`;
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain", "User-Agent": UA },
      body: q,
    });
    if (!r.ok) throw new Error(`Overpass ${r.status}`);
    const d = await r.json();
    // Dedupe by name (Overpass can return the same business as several nodes).
    const seen = new Set();
    const els = (d.elements || []).filter((el) => {
      const nm = el.tags?.name;
      if (!nm || seen.has(nm)) return false;
      seen.add(nm);
      return true;
    });

    let count = 0;
    for (const el of els) {
      if (count >= limit) break;
      const g = el.tags;
      const website = g.website || g["contact:website"] || null;
      count++;
      yield {
        name: g.name,
        website,
        category: titleCase(term) || g.amenity || g.shop || g.craft || "Business",
        city: titleCase(location),
        phone: g.phone || g["contact:phone"] || null,
        signal: website ? "Has website — review for gaps" : "No website",
        score: website ? 6 : 9,
        raw: { osm_id: el.id },
      };
    }
  },
};
