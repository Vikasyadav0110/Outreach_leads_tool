// Node-side enforcement (the edge middleware can't read the DB). Used by the
// root layout (pages) and by API route handlers.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAuthConfig, getSessionSecret } from "./authStore";
import { verifySession, SESSION_COOKIE } from "./auth";

async function hasValidSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySession(token, getSessionSecret());
}

// For server components / the root layout: redirect to /login when protected.
export async function requireAuthPage() {
  const cfg = getAuthConfig();
  if (!cfg.enabled) return;
  const path = headers().get("x-pathname") || "";
  if (path === "/login") return; // never guard the login page itself
  if (await hasValidSession()) return;
  redirect("/login");
}

// For API route handlers: returns a 401 response when blocked, else null.
export async function requireApiAuth() {
  const cfg = getAuthConfig();
  if (!cfg.enabled) return null;
  if (await hasValidSession()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
