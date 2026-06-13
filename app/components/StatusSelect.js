"use client";

import { LEAD_STATUSES, statusMeta } from "./status";

// Controlled status pill: shows the current status as a colored badge with a
// chevron, and overlays a transparent native <select> so picking a new value
// uses the OS dropdown. Parent owns the value + persistence.
export default function StatusSelect({ value, onChange, saving }) {
  const meta = statusMeta(value);
  return (
    <div className="relative inline-flex items-center">
      <span className={`badge gap-1 ${meta.cls} ${saving ? "opacity-60" : ""}`}>
        {meta.label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Lead status"
        className="absolute inset-0 w-full cursor-pointer opacity-0"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
