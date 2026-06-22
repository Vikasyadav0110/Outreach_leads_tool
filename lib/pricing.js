// Client-safe pricing mirror — lets the UI show a cost estimate on Run buttons
// WITHOUT importing lib/anthropic.js (which pulls in the SDK + server-only db).
// Keep the per-1M-token numbers in sync with PRICING in lib/anthropic.js.
export const PRICE_PER_1M = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
};

// Rough per-step token budgets for a pre-click estimate. find/research use web
// search and vary a lot → flagged approximate; qualify/write are capped, so
// their estimates are tighter. These are deliberately conservative.
const STEP_ESTIMATE = {
  // step key → { model, inTok, outTok, approx }
  findLeads: { model: "claude-opus-4-8", inTok: 3000, outTok: 3500, approx: true },
  qualify: { model: "claude-sonnet-4-6", inTok: 2000, outTok: 2500, approx: false },
  writeMessages: { model: "claude-sonnet-4-6", inTok: 2500, outTok: 4000, approx: false },
};

// Returns { usd, approx } for a step, or null if unknown.
export function estimateStepCost(stepKey) {
  const e = STEP_ESTIMATE[stepKey];
  if (!e) return null;
  const p = PRICE_PER_1M[e.model] || { in: 0, out: 0 };
  const usd = (e.inTok / 1e6) * p.in + (e.outTok / 1e6) * p.out;
  return { usd, approx: e.approx };
}

export function fmtEstimate(stepKey) {
  const est = estimateStepCost(stepKey);
  if (!est) return "";
  const money = est.usd < 1 ? `$${est.usd.toFixed(3)}` : `$${est.usd.toFixed(2)}`;
  return `${est.approx ? "~" : "~"}${money}${est.approx ? " approx" : ""}`;
}
