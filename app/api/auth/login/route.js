import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { getAuthConfig, getSessionSecret, verifyLogin } from "@/lib/authStore";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

export const POST = apiHandler(async (req) => {
  if (!getAuthConfig().enabled) {
    throw new ApiError("Authentication is not enabled.", 400);
  }
  const { username, password } = await req.json().catch(() => ({}));
  if (!verifyLogin(username, password)) {
    throw new ApiError("Incorrect email or password.", 401);
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
});
