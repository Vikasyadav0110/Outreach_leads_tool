import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="text-5xl font-bold text-accent">404</div>
      <h1 className="mt-3 text-lg font-semibold text-ink">Page not found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <Link href="/" className="btn-primary mt-5">
        Back to dashboard
      </Link>
    </div>
  );
}
