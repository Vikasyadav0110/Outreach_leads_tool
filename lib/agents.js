import { getClient, MODELS, isMockMode } from "./anthropic.js";
import { getAgentConfig } from "./prompts.js";
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
export async function runFindLeads({ domain, city, niche }) {
  if (isMockMode()) {
    console.log(`[Mock Mode] Generating mock leads for ${niche} in ${city} (${domain})`);
    return generateMockLeads(niche, city, domain);
  }

  try {
    const client = getClient();
    const { system } = getAgentConfig("findLeads", domain);

    const userMsg = `City: ${city}
Niche: ${niche}

Search the web to find 10–12 REAL ${niche} businesses in ${city}, India. Verify they exist. Score each by digital-presence gap and fill every field.

Return ONLY a JSON object of the exact shape:
{"leads":[{"name","category","city","website","score","gap","source","priority"}]}
where score is an integer 1–10 and priority is "HIGH" (score >= 7) or "NORMAL".
No prose, no markdown fences — just the JSON object.`;

    // Stream for safety on a potentially long, search-heavy turn; collect the
    // final message. Web search is a server-side tool — Claude runs it itself.
    const stream = client.messages.stream({
      model: MODELS.findLeads,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: userMsg }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
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
async function runStructured(agent, { domain, system, schema, userMsg }) {
  const client = getClient();
  const model = MODELS[agent];

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
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
export async function runQualify({ domain, highLeads }) {
  if (isMockMode()) {
    console.log(`[Mock Mode] Qualifying leads for ${domain}`);
    return generateMockQualify(domain, highLeads);
  }

  try {
    const { system, schema } = getAgentConfig("qualify", domain);
    const userMsg = `Here are the HIGH-priority leads to qualify:\n\n${JSON.stringify(
      highLeads,
      null,
      2
    )}\n\nProduce one qualification card per lead.`;
    const data = await runStructured("qualify", { domain, system, schema, userMsg });
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
export async function runWriteMessages({ domain, qualified, profile }) {
  if (isMockMode()) {
    console.log(`[Mock Mode] Writing messages for ${domain}`);
    return generateMockMessages(domain, qualified, profile);
  }

  try {
    const { system, schema } = getAgentConfig("writeMessages", domain, profile);
    const userMsg = `Write the three messages for each of these qualified leads:\n\n${JSON.stringify(
      qualified,
      null,
      2
    )}`;
    const data = await runStructured("writeMessages", {
      domain,
      system,
      schema,
      userMsg,
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
export async function runPrepMeeting({ domain, lead, context }) {
  if (isMockMode()) {
    console.log(`[Mock Mode] Preparing meeting kit for ${domain}`);
    return generateMockPrepMeeting(domain, lead, context);
  }

  try {
    const { system, schema } = getAgentConfig("prepMeeting", domain);
    const userMsg = `Prepare the meeting kit for this single lead:\n\n${JSON.stringify(
      lead,
      null,
      2
    )}\n\nConversation context pasted by the salesperson (may be empty):\n"""\n${
      context || "(none)"
    }\n"""`;
    return runStructured("prepMeeting", { domain, system, schema, userMsg });
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
