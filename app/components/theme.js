// White-label accent presets. Values are space-separated RGB channels so they
// work with Tailwind's alpha modifiers (e.g. bg-accent/10) via the
// `rgb(var(--accent) / <alpha-value>)` color definition in tailwind.config.js.
export const ACCENTS = {
  blue: { label: "Blue", accent: "26 86 219", accent2: "79 70 229", swatch: "#1A56DB" },
  violet: { label: "Violet", accent: "124 58 237", accent2: "139 92 246", swatch: "#7C3AED" },
  emerald: { label: "Emerald", accent: "5 150 105", accent2: "16 185 129", swatch: "#059669" },
  rose: { label: "Rose", accent: "225 29 72", accent2: "244 63 94", swatch: "#E11D48" },
  amber: { label: "Amber", accent: "217 119 6", accent2: "245 158 11", swatch: "#D97706" },
  slate: { label: "Slate", accent: "51 65 85", accent2: "71 85 105", swatch: "#334155" },
};

export const DEFAULT_ACCENT = "blue";

// CSS to drop into a :root style tag for the chosen accent.
export function accentVars(key) {
  const a = ACCENTS[key] || ACCENTS[DEFAULT_ACCENT];
  return `--accent:${a.accent};--accent2:${a.accent2};`;
}
