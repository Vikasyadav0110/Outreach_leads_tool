// Shared formatting helpers (safe to import from server or client components).

// USD cost: more decimals for sub-dollar amounts.
export function fmtCost(usd) {
  const n = Number(usd) || 0;
  if (n === 0) return "$0.00";
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Deterministic UTC date (DD Mon YYYY) — identical on server and client, so it
// avoids hydration mismatches in client components.
export function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Same format; returns "" for empty/invalid (used in the lead timeline).
export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
