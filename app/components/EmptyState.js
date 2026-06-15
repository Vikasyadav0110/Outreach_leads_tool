// One consistent empty state: soft-circle icon, title, hint, optional action.
export default function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="card flex flex-col items-center justify-center px-8 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent/10 to-accent2/10 text-accent">
          {icon}
        </div>
      )}
      {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
      {hint && <p className="mt-1 max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
