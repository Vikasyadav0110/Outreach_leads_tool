import { NextResponse } from "next/server";

// Runs on the edge runtime, so it must NOT import the DB. Its only job now is to
// surface the request path to server components (the root layout reads
// `x-pathname` to know whether to skip the auth guard on /login). Actual auth
// enforcement lives in the Node layer (lib/authGuard + app/layout.js).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
