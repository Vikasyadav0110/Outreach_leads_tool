// Replace template tokens with real values on insert. Supports curly tokens
// ({business}, {name}, {gap}, {service}, {city}, {me}, {myLocation}) and the
// legacy bracket placeholders used by the starter templates ([Your name], etc.).
// Unfilled tokens are left as-is so the user can spot what's missing.

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function fillTemplate(text, vars = {}) {
  if (!text) return text;
  const map = {
    "{business}": vars.business,
    "{name}": vars.name || "there",
    "{gap}": vars.gap,
    "{service}": vars.service,
    "{city}": vars.city,
    "{me}": vars.me,
    "{mylocation}": vars.myLocation,
    "[your name]": vars.me,
    "[your city]": vars.myLocation,
    "[your location]": vars.myLocation,
  };
  let out = text;
  for (const [token, val] of Object.entries(map)) {
    if (val == null || val === "") continue;
    out = out.replace(new RegExp(esc(token), "gi"), val);
  }
  return out;
}

// Human-readable list of supported tokens (shown as a hint on the Templates page).
export const TEMPLATE_TOKENS = [
  "{business}",
  "{name}",
  "{gap}",
  "{service}",
  "{city}",
  "{me}",
  "{myLocation}",
];
