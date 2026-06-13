"use client";

import { DOMAIN_ORDER, DOMAIN_META } from "./Brand";

// 4-tile domain picker shared by the new-campaign form and the onboarding wizard.
export default function DomainTiles({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {DOMAIN_ORDER.map((key) => {
        const meta = DOMAIN_META[key];
        const Icon = meta.Icon;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={`flex flex-col items-start gap-2 rounded-card border p-3 text-left transition duration-150 disabled:opacity-60 ${
              selected ? meta.tileOn : meta.tileOff
            }`}
          >
            <span className={meta.iconText}>
              <Icon width="20" height="20" />
            </span>
            <span className="text-sm font-medium text-ink">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
