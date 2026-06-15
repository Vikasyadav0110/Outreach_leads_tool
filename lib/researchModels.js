// Models the Claude Research source may use, chosen per-run in the UI. Client-safe
// (no SDK imports) so both the picker (client) and the adapter (server) share it.
// Server validates against this allowlist — never trust an arbitrary model string.
export const RESEARCH_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 · best value", cost: "$3 / $15 per 1M" },
  { id: "claude-opus-4-8", label: "Opus 4.8 · best quality", cost: "$5 / $25 per 1M" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 · cheapest", cost: "$1 / $5 per 1M" },
];

export const DEFAULT_RESEARCH_MODEL = "claude-sonnet-4-6";

export function isValidResearchModel(m) {
  return RESEARCH_MODELS.some((x) => x.id === m);
}
