import { NextResponse } from "next/server";

// Typed error for routes: throw `new ApiError("msg", 400)` to control the status.
// Anything else thrown becomes a 500 with a generic message (no internals leak).
export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Wrap a route handler so every route gets consistent error handling: known
// ApiError → its status + message; unexpected error → logged server-side, 500
// with a generic message (never the raw stack/message to the client).
export function apiHandler(handler) {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error("[api] unhandled error:", err);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }
  };
}
