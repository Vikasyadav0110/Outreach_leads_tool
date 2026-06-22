// Lead pipeline statuses — shared by the UI (badges, dropdown, summary) and
// validated server-side in the outcomes route. The `cls` strings are full
// Tailwind classes so the JIT compiler picks them up from this file.
export const LEAD_STATUSES = [
  { key: "new", label: "New", cls: "bg-neutral-100 text-muted", dot: "bg-neutral-300" },
  { key: "contacted", label: "Contacted", cls: "bg-blue-50 text-accent", dot: "bg-accent" },
  { key: "replied", label: "Replied", cls: "bg-amber-50 text-warning", dot: "bg-warning" },
  { key: "meeting", label: "Meeting", cls: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  { key: "won", label: "Won", cls: "bg-green-50 text-success", dot: "bg-success" },
  { key: "lost", label: "Lost", cls: "bg-red-50 text-danger", dot: "bg-danger" },
];

export const STATUS_KEYS = LEAD_STATUSES.map((s) => s.key);
export const DEFAULT_STATUS = "new";

export function statusMeta(key) {
  return LEAD_STATUSES.find((s) => s.key === key) || LEAD_STATUSES[0];
}

// ---- Global lead lifecycle (normalized model) ----
// A lead's progress across the whole funnel (vs LEAD_STATUSES above, which is
// the per-campaign ENGAGEMENT outcome). Used by the /leads hub + StatusBadge +
// dashboard funnel. `cls` strings are full Tailwind classes for the JIT.
export const LEAD_LIFECYCLE = [
  { key: "new", label: "New", cls: "bg-neutral-100 text-muted", dot: "bg-neutral-300" },
  { key: "qualified", label: "Qualified", cls: "bg-blue-50 text-accent", dot: "bg-accent" },
  { key: "in_campaign", label: "In campaign", cls: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  { key: "messaged", label: "Messaged", cls: "bg-cyan-50 text-cyan-700", dot: "bg-cyan-500" },
  { key: "sent", label: "Contacted", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  { key: "replied", label: "Replied", cls: "bg-amber-50 text-warning", dot: "bg-warning" },
  { key: "meeting_booked", label: "Meeting booked", cls: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  { key: "won", label: "Won", cls: "bg-green-50 text-success", dot: "bg-success" },
  { key: "lost", label: "Lost", cls: "bg-red-50 text-danger", dot: "bg-danger" },
];
export const LIFECYCLE_KEYS = LEAD_LIFECYCLE.map((s) => s.key);
export function lifecycleMeta(key) {
  return LEAD_LIFECYCLE.find((s) => s.key === key) || LEAD_LIFECYCLE[0];
}
