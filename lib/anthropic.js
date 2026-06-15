import Anthropic from "@anthropic-ai/sdk";
import { AsyncLocalStorage } from "node:async_hooks";
import { getSettings, insertUsageEvent } from "./db";
import { isValidProvider, DEFAULT_TASK_PROVIDERS } from "./aiTasks";

// LLM gateway. The active provider (anthropic | gemini) is read from settings,
// so agent code keeps calling one client interface (.messages.create / .stream)
// and this module routes to Claude or Gemini transparently.
let rawClient;
let wrapped;

// USD per 1M tokens, per model (list pricing) — used for cost estimation.
export const PRICING = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  // Google Gemini (approx list pricing)
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
};

// Process-global usage accumulator (single-user local app). A route resets it,
// runs the agent, then reads the total — see resetUsage/getUsage.
let _usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

// Context for the in-flight LLM call, so recordUsage() can tag the ledger row
// with the task/campaign it belongs to. Stored in AsyncLocalStorage so parallel
// requests don't clobber each other's attribution (the previous process-global
// could mis-tag usage when two agents ran at once).
const callContext = new AsyncLocalStorage();
const DEFAULT_CALL = { task: "other", campaignId: null, module: null };

export function beginCall(meta = {}) {
  // enterWith binds the store to the CURRENT async context onward, so a later
  // recordUsage() in the same await-chain reads this call's metadata — while a
  // concurrent request, running in its own async context, keeps its own store.
  callContext.enterWith({
    task: meta.task || "other",
    campaignId: meta.campaignId ?? null,
    module: meta.module ?? null,
  });
}

function currentCall() {
  return callContext.getStore() || DEFAULT_CALL;
}

export function resetUsage() {
  _usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}
export function getUsage() {
  return { ..._usage };
}
function recordUsage(model, usage) {
  if (!usage) return;
  const p = PRICING[model] || { in: 0, out: 0 };
  const input =
    (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0);
  const output = usage.output_tokens || 0;
  const cost = (input / 1e6) * p.in + (output / 1e6) * p.out;
  _usage.inputTokens += input;
  _usage.outputTokens += output;
  _usage.costUsd += cost;

  // Append to the persistent ledger. Derive provider from the model id actually
  // used (correct even after a Gemini Pro→Flash 429 fallback). Never let ledger
  // I/O break a live LLM call.
  try {
    const cc = currentCall();
    insertUsageEvent({
      task: cc.task,
      provider: String(model).startsWith("gemini") ? "gemini" : "anthropic",
      model,
      inputTokens: input,
      outputTokens: output,
      costUsd: cost,
      campaignId: cc.campaignId,
      module: cc.module,
      mock: false,
    });
  } catch {
    /* ignore — ledger is best-effort */
  }
}

// ---- Active provider ----
// `prefer` lets a caller force a provider for one task (per-task routing). When
// omitted we fall back to the global aiProvider setting. A forced provider whose
// key is missing falls back to the other provider so a task never hard-fails.
function provider(prefer) {
  let want;
  if (prefer === "gemini" || prefer === "anthropic") want = prefer;
  else {
    try {
      want = getSettings().aiProvider === "gemini" ? "gemini" : "anthropic";
    } catch {
      want = "anthropic";
    }
  }
  if (want === "gemini" && !process.env.GEMINI_API_KEY && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (want === "anthropic" && !process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY) return "gemini";
  return want;
}

// Resolve the provider for a specific TASK (API Management). Reads the user's
// per-task override from settings, falls back to the task's built-in default,
// then runs it through provider() so a missing key downgrades to the single
// available provider. Always returns exactly ONE provider — a task is never
// split across two APIs.
export function providerForTask(taskId) {
  let want;
  try {
    want = getSettings().taskProviders?.[taskId];
  } catch {
    /* ignore — fall back to default */
  }
  if (!isValidProvider(want)) want = DEFAULT_TASK_PROVIDERS[taskId] || "anthropic";
  return provider(want);
}

// ---- Gemini support ----

// Map any caller-supplied model id to a Gemini model: Opus-tier → Pro, the rest
// (Sonnet/Haiku/etc.) → Flash. A gemini-* id is used as-is.
function mapToGemini(model) {
  if (typeof model === "string" && model.startsWith("gemini")) return model;
  if (typeof model === "string" && model.includes("opus")) return "gemini-2.5-pro";
  return "gemini-2.5-flash";
}

// Gemini's responseSchema is an OpenAPI subset — strip JSON-Schema-only keys
// (e.g. additionalProperties) that would fail compilation.
function cleanSchemaForGemini(schema) {
  if (Array.isArray(schema)) return schema.map(cleanSchemaForGemini);
  if (schema && typeof schema === "object") {
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "additionalProperties") continue;
      out[k] = cleanSchemaForGemini(v);
    }
    return out;
  }
  return schema;
}

// One Gemini generateContent call, returned in Anthropic response shape so the
// agents don't need to know which provider answered.
async function callGemini({ model, system, messages, maxTokens, schema, useSearch }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");

  const contents = (messages || []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : String(m.content || "") }],
  }));

  const buildBody = (m) => {
    const b = {
      contents,
      ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        // Grounded search answers carry citations and run long — give them
        // extra headroom so the JSON isn't truncated mid-object.
        maxOutputTokens: useSearch ? Math.max(maxTokens || 4000, 8000) : maxTokens || 4000,
        // Gemini 2.5 are thinking models — thinking counts against the output
        // budget, so without this they can spend it all and return empty text.
        // Disable on Flash (budget 0); keep a tiny budget on Pro (min 128).
        thinkingConfig: { thinkingBudget: String(m).includes("flash") ? 0 : 128 },
      },
    };
    if (useSearch) b.tools = [{ google_search: {} }]; // native web grounding (Agent 1)
    else if (schema) {
      b.generationConfig.responseMimeType = "application/json";
      b.generationConfig.responseSchema = cleanSchemaForGemini(schema);
    }
    return b;
  };

  const attempt = (m) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(m)),
    });

  let used = model;
  let res = await attempt(used);
  // Free tier gives Pro zero quota — fall back to Flash on a quota/rate error.
  if (!res.ok && res.status === 429 && !String(used).includes("flash")) {
    used = "gemini-2.5-flash";
    res = await attempt(used);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
  const um = data.usageMetadata || {};
  recordUsage(used, {
    input_tokens: um.promptTokenCount || 0,
    output_tokens: (um.candidatesTokenCount || 0) + (um.thoughtsTokenCount || 0),
  });
  return {
    content: [{ type: "text", text }],
    stop_reason: cand?.finishReason === "SAFETY" ? "refusal" : "end_turn",
    usage: { input_tokens: um.promptTokenCount || 0, output_tokens: um.candidatesTokenCount || 0 },
  };
}

// Anthropic-shaped client backed by Gemini.
function geminiClient() {
  return {
    messages: {
      create: async (args) =>
        callGemini({
          model: mapToGemini(args.model),
          system: args.system,
          messages: args.messages,
          maxTokens: args.max_tokens,
          schema: args.output_config?.format?.schema,
        }),
      stream: (args) => ({
        finalMessage: async () =>
          callGemini({
            model: mapToGemini(args.model),
            system: args.system,
            messages: args.messages,
            maxTokens: args.max_tokens,
            useSearch: Array.isArray(args.tools) && args.tools.length > 0,
          }),
      }),
    },
  };
}

// ---- Public client ----
// Pass `prefer` ("anthropic" | "gemini") to force a provider for this task.
// Major reasoning tasks ask for "anthropic"; cheap writing asks for "gemini".
export function getClient(prefer) {
  if (provider(prefer) === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set. Add it to .env.local to use Gemini.");
    }
    return geminiClient();
  }
  // Anthropic (default)
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key."
    );
  }
  if (!rawClient) {
    rawClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  if (!wrapped) wrapped = wrapClient(rawClient);
  return wrapped;
}

// Transparent wrapper that records token usage from each Anthropic response.
function wrapClient(c) {
  return {
    messages: {
      create: async (args) => {
        const res = await c.messages.create(args);
        recordUsage(args.model, res?.usage);
        return res;
      },
      stream: (args) => {
        const s = c.messages.stream(args);
        const finalMessage = s.finalMessage.bind(s);
        s.finalMessage = async () => {
          const m = await finalMessage();
          recordUsage(args.model, m?.usage);
          return m;
        };
        return s;
      },
    },
  };
}

// Mock mode = no usable key for the provider this task will use (or forced).
export function isMockMode(prefer) {
  if (process.env.MOCK_MODE === "true" || global.isMockMode === true) return true;
  if (provider(prefer) === "gemini") return !process.env.GEMINI_API_KEY;
  return (
    !process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-api03-8f5n")
  );
}

// Per-agent model choice (Anthropic ids). Agent 1 uses the strongest model; the
// rest use Sonnet. Under the Gemini provider these map to Pro/Flash via
// mapToGemini, so agent code is unchanged.
export const MODELS = {
  findLeads: "claude-opus-4-8",
  qualify: "claude-sonnet-4-6",
  writeMessages: "claude-sonnet-4-6",
  prepMeeting: "claude-sonnet-4-6",
};
