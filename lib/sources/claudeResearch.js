// Prompt-driven source: Claude (Opus) + live web search finds REAL companies and
// their public buying signals from a free-form brief. Uses the Anthropic key you
// already have — no third-party provider. By design it does NOT invent contact
// emails (that needs a data API); contacts are left blank ("find on LinkedIn").
import { getClient, isMockMode, providerForTask, beginCall } from "../anthropic";
import { parseJsonLoose } from "../agents";
import { DEFAULT_RESEARCH_MODEL, isValidResearchModel } from "../researchModels";
import { modelFor } from "../aiTasks";
import { sleep, rand, pick, slugDomain, titleCase } from "./util";

// Cost guards (credit-limited): few companies, tight tokens, few searches.
const MAX_COMPANIES = 6;
const MAX_TOKENS = 2500;
const MAX_SEARCHES = 3;

// Pull text blocks out of a web-search response (skips tool_use/search blocks).
function joinText(content) {
  return content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
const clampScore = (v) => Math.min(10, Math.max(1, Math.round(Number(v) || 5)));

// Built-in "Enterprise Buyers" brief: target organizations that OUTSOURCE
// software/dev projects to vendors (the buyers who give work to small firms).
const ENTERPRISE_BUYERS_BRIEF =
  "Find large companies, enterprises, and government bodies that OUTSOURCE software / app / web development to external vendors or agencies — i.e. buyers that give projects to smaller firms. Strong signals: they recently posted an RFP or tender for software, publicly hire software consultancies / system integrators, run an active vendor/partner program, or are building offshore/nearshore development teams. Include private companies and public bodies. For each, the 'signal' must be the concrete outsourcing evidence you found (e.g. 'Posted RFP for CRM rebuild', 'Engages offshore dev partners', 'Vendor empanelment notice').";

function buildBrief({ prompt, term, location, role, industry, tech, enterpriseBuyers }) {
  if (prompt && prompt.trim()) return prompt.trim();
  if (enterpriseBuyers) {
    return [ENTERPRISE_BUYERS_BRIEF, location && `Focus market: ${location}.`, industry && `Industry: ${industry}.`]
      .filter(Boolean)
      .join(" ");
  }
  return [
    term && `Niche/service: ${term}`,
    industry && `Industry: ${industry}`,
    location && `Location: ${location}`,
    role && `Decision-maker: ${role}`,
    tech && `Tech stack: ${tech}`,
  ].filter(Boolean).join(". ") || "companies that need software/IT development work";
}

function systemPrompt(pipeline) {
  if (pipeline === "sell") {
    return `You are a B2B lead researcher for an international IT/software-services company. Using web search, find REAL, currently-operating companies that match the user's brief and plausibly NEED to build or scale software.

Score each 1–10 by BUYING INTENT + FIT (9–10 explicit demand: posted project / hiring multiple engineers / recently funded; 6–8 strong fit: scaling, outdated/migrating stack; 1–3 weak). For "signal", give the single concrete intent signal you found (e.g. "Hiring 4 backend engineers", "Raised Series A ($12M)", "Running legacy Magento").

Only include companies you can actually verify exist (real name + real domain). NEVER invent contact emails or phone numbers — leave those out.`;
  }
  return `You are a lead researcher for a digital-services agency. Using web search, find REAL, currently-operating LOCAL businesses that match the user's brief and have a digital-presence gap.

Score each 1–10 by gap size (9–10 no website; 6–8 outdated/weak; 1–3 strong presence). For "signal", describe the concrete gap (e.g. "Listed on Maps only, no website"). Only include businesses you can verify. NEVER invent contact details.`;
}

function mockLead({ pipeline, term, location }) {
  if (pipeline === "sell") {
    const name = `${pick(["Northwind", "Lumen", "Cobalt", "Vantage", "Helio", "Quanta", "Orbit", "Atlas"])} ${pick(["Labs", "Technologies", "Software", "AI", "Cloud"])}`;
    const sig = pick(["Hiring 3 backend engineers", "Raised Series A", "Migrating off legacy stack", "Posted an RFP for a mobile app"]);
    return {
      name,
      website: `https://${slugDomain(name)}.com`,
      category: titleCase(term) || "Technology",
      city: titleCase(location) || "",
      signal: `${sig} (simulated)`,
      score: rand(6, 9),
      source: "Claude research",
      raw: { mock: true },
    };
  }
  const name = `${pick(["Royal", "Star", "Prime", "Urban", "Metro"])} ${titleCase(term) || "Local"} ${pick(["Services", "Hub", "Co."])}`;
  return {
    name,
    website: Math.random() < 0.4 ? `http://${slugDomain(name)}.in` : null,
    category: titleCase(term) || "Local business",
    city: titleCase(location) || "",
    signal: "No website (simulated)",
    score: rand(7, 10),
    source: "Claude research",
    raw: { mock: true },
  };
}

export default {
  id: "claude-research",
  label: "AI Research (web search)",
  pipeline: "sell",
  universal: true,
  description: "Describe your ideal client in plain English — your active AI provider (Claude or Gemini) finds real companies + buying signals via web search. Gemini Flash makes this near-free.",
  requiresKey: "ANTHROPIC_API_KEY",
  ready: () => !isMockMode(providerForTask("research")),

  async *fetch({ term, location, limit = 4, pipeline = "sell", prompt, role, industry, tech, model, enterpriseBuyers }) {
    const n = Math.min(limit, MAX_COMPANIES);
    // Provider is routed via API Management (default Anthropic). Under Anthropic
    // we honor the user-picked research model; under Gemini we use the task's
    // configured model (Pro) so research keeps strong reasoning + web grounding.
    const prefer = providerForTask("research");
    const useModel =
      prefer === "gemini"
        ? modelFor("research", "gemini")
        : isValidResearchModel(model)
          ? model
          : DEFAULT_RESEARCH_MODEL;

    // ---- Mock fallback (no/sim key for the routed provider): demo leads. ----
    if (isMockMode(prefer)) {
      for (let i = 0; i < n; i++) {
        await sleep(rand(180, 360));
        yield mockLead({ pipeline, term, location });
      }
      return;
    }

    // ---- Live: model + web search ----
    const brief = buildBrief({ prompt, term, location, role, industry, tech, enterpriseBuyers });
    const userMsg = `BRIEF: ${brief}
${location ? `Focus location/market: ${location}.` : ""}

Find ${n} REAL companies matching this brief. Use as few web searches as possible.
Return ONLY a JSON object of the exact shape:
{"leads":[{"name","website","category","city","signal","score"}]}
where score is an integer 1–10. website is the real URL or "none". No prose, no markdown fences — just the JSON object.`;

    const client = getClient(prefer);
    beginCall({ task: "research", module: pipeline });
    const stream = client.messages.stream({
      model: useModel,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(pipeline),
      messages: [{ role: "user", content: userMsg }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new Error("Claude declined this research request.");
    }

    const data = parseJsonLoose(joinText(message.content));
    const leads = Array.isArray(data) ? data : data.leads;
    if (!Array.isArray(leads)) throw new Error("No leads returned by Claude.");

    for (const l of leads.slice(0, n)) {
      const name = String(l.name || "").trim();
      if (!name) continue;
      const website = String(l.website || "").trim();
      yield {
        name,
        website: website && website.toLowerCase() !== "none" ? website : null,
        category: String(l.category || term || "").trim() || "Company",
        city: String(l.city || location || "").trim(),
        signal: String(l.signal || "").trim() || "Researched by Claude",
        score: clampScore(l.score),
        contact: null,
        email: null,
        source: "Claude research",
        raw: l,
      };
    }
  },
};
