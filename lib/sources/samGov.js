// Pipeline B (sell) — SAM.gov: ACTIVE US federal RFPs / solicitations seeking
// software vendors (NAICS 541511). An open solicitation is the highest-intent
// signal there is — the organization is literally shopping for a vendor right
// now. Free API key (request at api.sam.gov, ~10 business days). Mock until set.
import { sleep, rand, pick, titleCase } from "./util";
import { scoreSellLead } from "../score";

const DEFAULT_NAICS = "541511";

const MOCK_ORGS = ["Dept. of Commerce", "State of California", "City of Austin IT", "Dept. of Transportation", "EPA"];
const MOCK_TITLES = [
  "Custom web application development",
  "Legacy system modernization",
  "Mobile app design & build",
  "Data platform & dashboard build",
  "API integration services",
];

function mockLead() {
  const org = pick(MOCK_ORGS);
  const title = pick(MOCK_TITLES);
  const days = rand(7, 40);
  return {
    name: org,
    website: null,
    category: "Open RFP · software",
    city: "",
    country: "USA",
    signal: `Open RFP: "${title}" · responses due in ${days} days`,
    score: scoreSellLead({ project: true }),
    raw: { mock: true },
  };
}

export default {
  id: "samgov",
  label: "SAM.gov RFPs (open solicitations)",
  pipeline: "sell",
  description: "Active US federal RFPs seeking software vendors (NAICS 541511) — buyers shopping right now. Free key from api.sam.gov.",
  requiresKey: "SAM_GOV_API_KEY",
  ready: () => !!process.env.SAM_GOV_API_KEY,

  async *fetch({ term, naics, limit = 12, postedFrom }) {
    const key = process.env.SAM_GOV_API_KEY;
    const n = Math.min(limit, 25);

    // ---- Mock fallback (no key) ----
    if (!key) {
      for (let i = 0; i < Math.min(n, 6); i++) {
        await sleep(rand(150, 320));
        yield mockLead();
      }
      return;
    }

    // ---- Live: SAM.gov Get Opportunities ----
    const code = (naics || "").trim() || DEFAULT_NAICS;
    const mmddyyyy = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
    const from = postedFrom || mmddyyyy(new Date(Date.now() - 90 * 86400000));
    const to = mmddyyyy(new Date());

    const params = new URLSearchParams({
      api_key: key,
      ncode: code,
      postedFrom: from,
      postedTo: to,
      limit: String(n),
      ptype: "o,p,r", // solicitation / presolicitation / sources-sought
    });
    if (term) params.set("title", term);

    const res = await fetch(`https://api.sam.gov/opportunities/v2/search?${params.toString()}`);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`SAM.gov API ${res.status}: ${t.slice(0, 160)}`);
    }
    const data = await res.json();
    for (const o of (data.opportunitiesData || []).slice(0, n)) {
      const org = o.fullParentPathName || o.organizationType || o.title || "Federal buyer";
      const deadline = o.responseDeadLine ? ` · responses due ${String(o.responseDeadLine).slice(0, 10)}` : "";
      yield {
        name: titleCase(String(org).split(".").slice(-1)[0] || org),
        website: null,
        category: "Open RFP · software",
        city: o.placeOfPerformance?.city?.name || "",
        country: "USA",
        signal: `Open RFP: "${(o.title || "Software services").slice(0, 70)}"${deadline}`,
        score: scoreSellLead({ project: true }),
        raw: { source: "samgov", noticeId: o.noticeId, link: o.uiLink, naics: code },
      };
    }
  },
};
