import { getClient, MODELS, isMockMode, providerForTask, beginCall } from "./anthropic.js";
import { getAgentConfig } from "./prompts.js";

// Per-task provider routing now lives in settings (API Management) and is
// resolved per call via providerForTask(taskId) — see lib/aiTasks.js for the
// built-in defaults. Each task always resolves to exactly ONE provider.
import {
  generateMockLeads,
  generateMockQualify,
  generateMockMessages,
  generateMockPrepMeeting,
} from "./mockData.js";

// Defensive JSON parse: structured outputs already return clean JSON, but for
// the web-search agent (which can't use output_config.format alongside the
// search tool) the model returns plain text. Strip markdown fences and any
// leading/trailing prose, then parse. Throws a clear error on failure.
export function parseJsonLoose(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Agent returned empty output.");
  }
  let t = text.trim();

  // Strip ```json ... ``` or ``` ... ``` fences if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) t = fence[1].trim();

  try {
    return JSON.parse(t);
  } catch {
    // Last resort: grab the outermost {...} or [...] span.
    const start = t.search(/[[{]/);
    const lastObj = t.lastIndexOf("}");
    const lastArr = t.lastIndexOf("]");
    const end = Math.max(lastObj, lastArr);
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("Agent did not return valid JSON.");
  }
}

// Concatenate all text blocks from a response (skips tool_use/server_tool_use
// and web-search result blocks).
function joinText(content) {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// ---- Agent 1: Lead Finder & Scorer (web search enabled) ----
// Web search results interleave with text, so we don't use structured outputs
// here; we instruct strict JSON and parse defensively. Uses the strongest model.
export async function runFindLeads({ domain, city, niche, module, campaignId }) {
  const prefer = providerForTask("findLeads");
  if (isMockMode(prefer)) {
    console.log(`[Mock Mode] Generating mock leads for ${niche} in ${city} (${domain})`);
    return generateMockLeads(niche, city, domain);
  }

  try {
    const client = getClient(prefer);
    beginCall({ task: "findLeads", campaignId, module });
    const { system } = getAgentConfig("findLeads", domain, undefined, module);

    const userMsg =
      module === "international"
        ? `Target market: ${city || "global"}
Service/niche: ${niche}

Search the web to find 6–8 REAL companies that plausibly NEED to build or scale software matching this niche. Verify they exist. Score each by BUYING INTENT + FIT and fill every field. Use as few web searches as possible.

Return ONLY a JSON object of the exact shape:
{"leads":[{"name","category","city","website","score","gap","source","priority"}]}
where score is an integer 1–10 (9–10 explicit demand: RFP posted / hiring multiple engineers / recently funded; 6–8 strong fit signals; 1–3 weak), "gap" is the specific build need or capacity opportunity, and priority is "HIGH" (score >= 7) or "NORMAL".
No prose, no markdown fences — just the JSON object.`
        : `City: ${city}
Niche: ${niche}

Search the web to find 6–8 REAL ${niche} businesses in ${city}, India. Verify they exist. Score each by digital-presence gap and fill every field. Use as few web searches as possible.

Return ONLY a JSON object of the exact shape:
{"leads":[{"name","category","city","website","score","gap","source","priority"}]}
where score is an integer 1–10 and priority is "HIGH" (score >= 7) or "NORMAL".
No prose, no markdown fences — just the JSON object.`;

    // Stream for safety on a potentially long, search-heavy turn; collect the
    // final message. Web search is a server-side tool — Claude runs it itself.
    // max_uses + max_tokens are kept tight to control credit spend.
    const stream = client.messages.stream({
      model: MODELS.findLeads,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: userMsg }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new Error("The model declined this lead-research request.");
    }

    const data = parseJsonLoose(joinText(message.content));
    const leads = Array.isArray(data) ? data : data.leads;
    if (!Array.isArray(leads)) throw new Error("No leads array in output.");

    // Normalize: ensure score is an int and priority matches the >=7 rule.
    return leads.map((l) => {
      const score = clampScore(l.score);
      return {
        name: str(l.name),
        category: str(l.category),
        city: str(l.city) || city,
        website: str(l.website) || "none",
        score,
        gap: str(l.gap),
        source: str(l.source),
        priority: score >= 7 ? "HIGH" : "NORMAL",
      };
    });
  } catch (err) {
    if (
      err?.message?.includes("credit balance") ||
      err?.message?.includes("billing") ||
      err?.status === 400
    ) {
      console.warn("[Anthropic API] Insufficient credits detected. Switching to Mock Fallback Mode dynamically.");
      global.isMockMode = true;
      return generateMockLeads(niche, city, domain);
    }
    throw err;
  }
}

// ---- Agents 2–4: structured outputs (guaranteed JSON) ----
async function runStructured(agent, { system, schema, userMsg, maxTokens = 4000, campaignId, module }) {
  const client = getClient(providerForTask(agent));
  const model = MODELS[agent];
  beginCall({ task: agent, campaignId, module });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMsg }],
    output_config: { format: { type: "json_schema", schema } },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }
  // With output_config.format the first text block is guaranteed valid JSON,
  // but we still parse defensively.
  return parseJsonLoose(joinText(response.content));
}

// Agent 2: Qualifier & Contact Finder
export async function runQualify({ domain, highLeads, module, campaignId }) {
  if (isMockMode(providerForTask("qualify"))) {
    console.log(`[Mock Mode] Qualifying leads for ${domain}`);
    return generateMockQualify(domain, highLeads);
  }

  try {
    const { system, schema } = getAgentConfig("qualify", domain, undefined, module);
    const userMsg = `Here are the HIGH-priority leads to qualify:\n\n${JSON.stringify(
      highLeads,
      null,
      2
    )}\n\nProduce one qualification card per lead.`;
    const data = await runStructured("qualify", { system, schema, userMsg, maxTokens: 4000, campaignId, module });
    return Array.isArray(data.cards) ? data.cards : [];
  } catch (err) {
    if (
      err?.message?.includes("credit balance") ||
      err?.message?.includes("billing") ||
      err?.status === 400
    ) {
      console.warn("[Anthropic API] Insufficient credits detected during qualification. Switching to Mock Fallback Mode.");
      global.isMockMode = true;
      return generateMockQualify(domain, highLeads);
    }
    throw err;
  }
}

// Agent 3: Message Writer
export async function runWriteMessages({ domain, qualified, profile, module, campaignId }) {
  const prefer = providerForTask("writeMessages");
  if (isMockMode(prefer)) {
    console.log(`[Mock Mode] Writing messages for ${domain} (provider: ${prefer})`);
    return generateMockMessages(domain, qualified, profile);
  }

  try {
    const { system, schema } = getAgentConfig("writeMessages", domain, profile, module);
    const userMsg = `Write the three messages for each of these qualified leads:\n\n${JSON.stringify(
      qualified,
      null,
      2
    )}`;
    const data = await runStructured("writeMessages", {
      system,
      schema,
      userMsg,
      maxTokens: 6000,
      campaignId,
      module,
    });
    return Array.isArray(data.messages) ? data.messages : [];
  } catch (err) {
    if (
      err?.message?.includes("credit balance") ||
      err?.message?.includes("billing") ||
      err?.status === 400
    ) {
      console.warn("[Anthropic API] Insufficient credits detected during message writing. Switching to Mock Fallback Mode.");
      global.isMockMode = true;
      return generateMockMessages(domain, qualified, profile);
    }
    throw err;
  }
}

// Agent 4: Meeting Closer (single lead + optional pasted context)
export async function runPrepMeeting({ domain, lead, context, module, campaignId }) {
  if (isMockMode(providerForTask("prepMeeting"))) {
    console.log(`[Mock Mode] Preparing meeting kit for ${domain}`);
    return generateMockPrepMeeting(domain, lead, context);
  }

  try {
    const { system, schema } = getAgentConfig("prepMeeting", domain, undefined, module);
    const userMsg = `Prepare the meeting kit for this single lead:\n\n${JSON.stringify(
      lead,
      null,
      2
    )}\n\nConversation context pasted by the salesperson (may be empty):\n"""\n${
      context || "(none)"
    }\n"""`;
    return runStructured("prepMeeting", { system, schema, userMsg, maxTokens: 2500, campaignId, module });
  } catch (err) {
    if (
      err?.message?.includes("credit balance") ||
      err?.message?.includes("billing") ||
      err?.status === 400
    ) {
      console.warn("[Anthropic API] Insufficient credits detected during meeting prep. Switching to Mock Fallback Mode.");
      global.isMockMode = true;
      return generateMockPrepMeeting(domain, lead, context);
    }
    throw err;
  }
}

// ---- small helpers ----
function clampScore(v) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 1;
  return Math.min(10, Math.max(1, n));
}
function str(v) {
  return v == null ? "" : String(v).trim();
}
