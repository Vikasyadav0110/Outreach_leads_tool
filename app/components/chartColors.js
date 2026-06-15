// Plain constants — NO "use client". Server components can't import non-component
// values from a client module (RSC manifest limitation), so colors live here and
// are shared by both server pages and the client chart kit.
export const CHART = {
  accent: "rgb(var(--accent))",
  accent2: "rgb(var(--accent2))",
  success: "#16a34a",
  warning: "#d97706",
  violet: "#7c3aed",
  danger: "#dc2626",
  neutral: "#cbd5e1",
};

export const SERIES = [CHART.accent, CHART.violet, CHART.warning, CHART.success, CHART.danger, CHART.neutral];

// Status → chart color, matching the LEAD_STATUSES dot palette in status.js.
export const STATUS_COLORS = {
  new: CHART.neutral,
  contacted: CHART.accent,
  replied: CHART.warning,
  meeting: CHART.violet,
  won: CHART.success,
  lost: CHART.danger,
};
