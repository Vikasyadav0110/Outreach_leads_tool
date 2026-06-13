import Anthropic from "@anthropic-ai/sdk";

// Single client, reused across all agent routes. The key is read server-side
// from .env.local and never reaches the browser.
let rawClient;
let wrapped;

// USD per 1M tokens, per model (Anthropic list pricing).
export const PRICING = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
};

// Process-global usage accumulator (single-user local app). A route resets it,
// runs the agent, then reads the total — see resetUsage/getUsage.
let _usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

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
  _usage.inputTokens += input;
  _usage.outputTokens += output;
  _usage.costUsd += (input / 1e6) * p.in + (output / 1e6) * p.out;
}

export function getClient() {
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

// Transparent wrapper that records token usage from each response, so cost can
// be tracked without changing the agent code that calls create()/stream().
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

export function isMockMode() {
  return (
    process.env.MOCK_MODE === "true" ||
    !process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-api03-8f5n") ||
    global.isMockMode === true
  );
}

// Per-agent model choice. Lead finding (Agent 1) drives the whole product's
// quality, so it runs on the strongest model; the rest run on Sonnet to keep
// per-campaign cost down. Change any line here to re-tier without touching
// agent logic.
//
// Both are current model IDs (see Anthropic models catalog). Do not append
// date suffixes to these aliases.
export const MODELS = {
  findLeads: "claude-opus-4-8",
  qualify: "claude-sonnet-4-6",
  writeMessages: "claude-sonnet-4-6",
  prepMeeting: "claude-sonnet-4-6",
};
