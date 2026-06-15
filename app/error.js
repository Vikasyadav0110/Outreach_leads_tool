"use client";

// Themed error boundary for the app. Catches render/runtime errors in any route
// segment and shows a recoverable screen instead of the default gray page.
export default function Error({ error, reset }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="text-4xl font-bold text-danger">Something broke</div>
      <p className="mt-2 max-w-sm text-sm text-muted">
        An unexpected error occurred. You can try again — if it keeps happening,
        reload the page.
      </p>
      {error?.digest && (
        <p className="mt-1 text-xs text-muted/70">Reference: {error.digest}</p>
      )}
      <div className="mt-5 flex gap-2">
        <button onClick={() => reset()} className="btn-primary">
          Try again
        </button>
        <a href="/" className="btn-ghost px-4 py-2">
          Dashboard
        </a>
      </div>
    </div>
  );
}
