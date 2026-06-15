// Pipeline B (sell) — RemoteOK: FREE public jobs feed, no API key. Companies
// hiring (esp. engineering) = a build-capacity signal you can broker. Contacts
// are left blank (find the decision-maker on LinkedIn / enrich with Apollo).
import { scoreSellLead } from "../score";

export default {
  id: "remoteok",
  label: "RemoteOK (hiring signal, free)",
  pipeline: "sell",
  description: "Free: companies hiring remote roles — a build-capacity signal. No API key.",
  requiresKey: null,
  ready: () => true,

  async *fetch({ term, location, limit = 12, role }) {
    const r = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "OutreachPilot/1.0 (lead sourcing)" },
    });
    if (!r.ok) throw new Error(`RemoteOK ${r.status}`);
    const arr = await r.json();
    // First element is a legal/metadata notice — keep only real postings.
    let jobs = (Array.isArray(arr) ? arr : []).filter((x) => x && x.company && x.position);

    // Match the query against the WHOLE posting (title, tags, company,
    // description). A strict whole-phrase title match returned 0 for queries
    // like "learning management system"; matching ANY single word is too loose
    // (generic words like "system"/"management" pull in junk). So we RANK by how
    // many query words hit and keep only solid matches: the full phrase, OR
    // (for multi-word queries) at least half the words.
    const t = (term || role || "").trim().toLowerCase();
    if (t) {
      const words = [...new Set(t.split(/\s+/).filter((w) => w.length > 2))];
      const need = words.length >= 2 ? Math.ceil(words.length / 2) : 1;
      jobs = jobs
        .map((j) => {
          const hay = `${j.position} ${(j.tags || []).join(" ")} ${j.company} ${j.description || ""}`.toLowerCase();
          const phrase = hay.includes(t);
          const hits = words.filter((w) => hay.includes(w)).length;
          return { j, rank: (phrase ? 100 : 0) + hits, ok: phrase || hits >= need };
        })
        .filter((x) => x.ok)
        .sort((a, b) => b.rank - a.rank)
        .map((x) => x.j);
    }
    if (location) {
      const loc = location.trim().toLowerCase();
      jobs = jobs.filter((j) => (j.location || "").toLowerCase().includes(loc) || (j.location || "").toLowerCase().includes("worldwide") || (j.location || "").toLowerCase().includes("remote"));
    }

    let count = 0;
    for (const j of jobs) {
      if (count >= limit) break;
      count++;
      yield {
        name: j.company,
        website: null,
        category: j.position,
        city: j.location || "Remote",
        signal: `Hiring: ${j.position}`,
        score: scoreSellLead({ hiring: 1 }),
        raw: { id: j.id, url: j.url },
      };
    }
  },
};
