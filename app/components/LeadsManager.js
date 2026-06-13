"use client";

import { useState } from "react";
import Categories from "./Categories";
import GlobalLeadsTable from "./GlobalLeadsTable";
import { LayersIcon } from "./icons";

function RowsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <rect x="3" y="13" width="18" height="5" rx="1" />
    </svg>
  );
}

const TABS = [
  { key: "category", label: "By category", icon: LayersIcon },
  { key: "all", label: "All leads", icon: RowsIcon },
];

export default function LeadsManager({ leads, mock }) {
  const [view, setView] = useState("category");

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = view === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-accent/10 text-accent" : "text-muted hover:text-ink"
              }`}
            >
              <Icon width="15" height="15" />
              {t.label}
            </button>
          );
        })}
      </div>

      {view === "category" ? (
        <Categories leads={leads} mock={mock} />
      ) : (
        <GlobalLeadsTable leads={leads} mock={mock} />
      )}
    </div>
  );
}
