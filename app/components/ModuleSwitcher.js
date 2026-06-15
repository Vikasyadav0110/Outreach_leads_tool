"use client";

import { MODULES, MODULE_COOKIE } from "@/lib/modules";

// Scopes the whole app to one business module. Stores the choice in a non-secret
// cookie the server reads (getActiveModule). We do a full reload (not just
// router.refresh) so EVERY server component — layout, sidebar highlight, and the
// current page's force-dynamic data — re-reads the cookie with no stale client
// cache. router.refresh() alone can leave the page showing the old module's data.
export default function ModuleSwitcher({ active }) {
  function pick(key) {
    if (key === active) return;
    document.cookie = `${MODULE_COOKIE}=${key}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <div className="rounded-lg border border-line bg-[#f7f7f4] p-0.5">
      <div className="grid grid-cols-2 gap-0.5">
        {MODULES.map((m) => {
          const on = m.key === active;
          const activeCls = m.tone === "violet" ? "bg-white text-violet-700" : "bg-white text-accent";
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => pick(m.key)}
              aria-pressed={on}
              title={m.blurb}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                on ? `${activeCls} shadow-sm` : "text-muted hover:text-ink"
              }`}
            >
              {m.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
