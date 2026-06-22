import { lifecycleMeta, statusMeta } from "./status";

// Single source of truth for status pills. `kind="lifecycle"` (default) renders a
// global lead status; `kind="engagement"` renders a per-campaign engagement.
export default function StatusBadge({ status, kind = "lifecycle" }) {
  if (!status) return <span className="badge bg-neutral-100 text-muted">—</span>;
  const m = kind === "engagement" ? statusMeta(status) : lifecycleMeta(status);
  return (
    <span className={`badge gap-1 ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
