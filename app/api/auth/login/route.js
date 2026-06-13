import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { getAuthConfig, getSessionSecret, verifyLogin } from "@/lib/authStore";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    if (!getAuthConfig().enabled) {
      return NextResponse.json({ error: "Authentication is not enabled." }, { status: 400 });
    }
    const { username, password } = await req.json().catch(() => ({}));
    if (!verifyLogin(username, password)) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }
    const token = await createSession(getSessionSecret());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Login failed." }, { status: 500 });
  }
}
