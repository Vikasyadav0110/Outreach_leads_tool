// Red inline alert with an optional retry button. Never a blank screen.
export default function ErrorAlert({ message, onRetry, retrying }) {
  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-4 rounded-card border border-red-200 bg-red-50 px-4 py-3">
      <div className="text-sm text-danger">
        <span className="font-semibold">Something went wrong. </span>
        {message}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="btn-ghost shrink-0 border-red-200 px-3 py-1 text-xs text-danger hover:bg-red-100"
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}
    </div>
  );
}
