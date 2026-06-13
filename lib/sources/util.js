// Small helpers shared by source adapters.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function slugDomain(name) {
  return (
    name
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "company"
  );
}

// Title-case a free-text term ("plumbers" -> "Plumbers").
export function titleCase(s) {
  return (s || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
