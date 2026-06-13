import { NextResponse } from "next/server";
import { getAuthConfig, setAuthConfig, getSessionSecret } from "@/lib/authStore";
import { requireApiAuth } from "@/lib/authGuard";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export const runtime = "nodejs";

// Safe to read while disabled (returns only enabled/username/hasPassword). Once
// enabled, it's protected like any other route.
export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  return NextResponse.json({ config: getAuthConfig() });
}

export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const wasEnabled = getAuthConfig().enabled;
    const config = setAuthConfig({
      enabled: body.enabled,
      username: body.username,
      password: body.password,
    });

    const res = NextResponse.json({ config });

    // Turning protection ON from an unauthenticated state would bounce the admin
    // on their next navigation — mint a session now so they stay logged in.
    if (config.enabled && !wasEnabled) {
      const token = await createSession(getSessionSecret());
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE,
        secure: process.env.NODE_ENV === "production",
      });
    }
    return res;
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not save." }, { status: 400 });
  }
}
