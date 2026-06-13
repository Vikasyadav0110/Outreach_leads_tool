// Shimmering placeholders shown while an agent is running. The `.skeleton`
// utility (globals.css) provides the animated gradient.

export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} />;
}

export function LeadsTableSkeleton({ rows = 6 }) {
  return (
    <div className="table-wrap p-4">
      <Skeleton className="mb-4 h-4 w-40" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="ml-auto h-5 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardsSkeleton({ count = 4 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-20 rounded-md" />
          </div>
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
          </div>
        </div>
      ))}
    </div>
  );
}
