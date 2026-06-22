// SSR-safe localStorage helpers for per-device UI state (form drafts, live
// results, selection, work-queue cursor). Keep keys namespaced by module so the
// Local and International workspaces never read each other's drafts.
//
// Usage: const key = draftKey("src", module, sourceId); saveDraft(key, value);
//        const v = loadDraft(key, fallback);

const PREFIX = "op";

export function draftKey(...parts) {
  return [PREFIX, ...parts.filter((p) => p != null && p !== "")].join(":");
}

export function loadDraft(key, fallback = null) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveDraft(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled storage — ignore */
  }
}

export function clearDraft(key) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Returns a debounced version of saveDraft for high-churn writers (e.g. typing
// in a form). One timer per caller instance.
export function makeDebouncedSaver(delay = 400) {
  let t = null;
  return (key, value) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => saveDraft(key, value), delay);
  };
}
