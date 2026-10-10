import Link from "next/link";

// One consistent page header across the whole app: optional back-link, optional
// eyebrow, title, subtitle, and a right-aligned action slot.
export default function PageHeader({ title, subtitle, action, backHref, backLabel, eyebrow }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {backHref && (
          <Link href={backHref} className="text-sm text-muted transition-colors hover:text-accent">
            ← {backLabel || "Back"}
          </Link>
        )}
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className={`h-display text-2xl text-ink sm:text-[1.7rem] ${backHref ? "mt-1" : ""}`}>{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
