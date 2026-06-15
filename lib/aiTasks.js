// Canonical list of AI tasks — the single source of truth shared by the UI
// (labels render in Settings → API Management), the agents, and the API routes.
// Client-SAFE: no SDK / db / next imports, so client components can import it
// (mirrors lib/modules.js vs the server-only lib/activeModule.js).

export const PROVIDERS = ["anthropic", "gemini"];

// Each task resolves to exactly ONE provider per run. `default` is the built-in
// routing (used when the user hasn't overridden it in settings). `models` is the
// model id each provider uses for this task — kept in sync with MODELS +
// mapToGemini in lib/anthropic.js (Opus-tier reasoning → Pro; the rest → Flash).
export const AI_TASKS = [
  {
    id: "findLeads",
    label: "Find leads",
    desc: "Web research + scoring of real businesses (Campaign step 1).",
    default: "anthropic",
    models: { anthropic: "claude-opus-4-8", gemini: "gemini-2.5-pro" },
  },
  {
    id: "qualify",
    label: "Qualify",
    desc: "Decision-maker, exact gap, contact details (Campaign step 2).",
    default: "anthropic",
    models: { anthropic: "claude-sonnet-4-6", gemini: "gemini-2.5-flash" },
  },
  {
    id: "writeMessages",
    label: "Write messages",
    desc: "Email + WhatsApp + call script drafting (Campaign step 3).",
    default: "gemini",
    models: { anthropic: "claude-sonnet-4-6", gemini: "gemini-2.5-flash" },
  },
  {
    id: "prepMeeting",
    label: "Prep meeting",
    desc: "Per-lead meeting brief / talking points.",
    default: "anthropic",
    models: { anthropic: "claude-sonnet-4-6", gemini: "gemini-2.5-flash" },
  },
  {
    id: "research",
    label: "AI Research source",
    desc: "Finds companies via web search (Sources → AI Research).",
    default: "anthropic",
    // User chose Gemini Pro for research (needs stronger reasoning + search).
    models: { anthropic: "claude-sonnet-4-6", gemini: "gemini-2.5-pro" },
  },
  {
    id: "copilot",
    label: "Copilot",
    desc: "In-app assistant chat.",
    default: "gemini",
    models: { anthropic: "claude-sonnet-4-6", gemini: "gemini-2.5-flash" },
  },
];

export const TASK_IDS = AI_TASKS.map((t) => t.id);

// id → default provider, e.g. { findLeads: "anthropic", writeMessages: "gemini" }
export const DEFAULT_TASK_PROVIDERS = Object.fromEntries(
  AI_TASKS.map((t) => [t.id, t.default])
);

export function isValidTaskId(id) {
  return TASK_IDS.includes(id);
}

export function isValidProvider(p) {
  return PROVIDERS.includes(p);
}

// The model id a (task, provider) pair will use. Falls back to the generic
// per-provider model when the task is unknown.
export function modelFor(taskId, provider) {
  const t = AI_TASKS.find((x) => x.id === taskId);
  if (!t) return provider === "gemini" ? "gemini-2.5-flash" : "claude-sonnet-4-6";
  return t.models[provider] || (provider === "gemini" ? "gemini-2.5-flash" : "claude-sonnet-4-6");
}

export function providerLabel(p) {
  return p === "gemini" ? "Google Gemini" : "Anthropic Claude";
}
