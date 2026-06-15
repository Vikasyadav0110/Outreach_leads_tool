import Link from "next/link";

// One consistent page header across the whole app: optional back-link, title,
// subtitle, and a right-aligned action slot.
export default function PageHeader({ title, subtitle, action, backHref, backLabel }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {backHref && (
          <Link href={backHref} className="text-sm text-muted hover:text-ink">
            ← {backLabel || "Back"}
          </Link>
        )}
        <h1 className={`h-display text-xl text-ink ${backHref ? "mt-1" : ""}`}>{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
