import { NextResponse } from "next/server";
import { createSavedSearch, listSavedSearches } from "@/lib/db";
import { getActiveModule } from "@/lib/activeModule";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

const SCOPES = ["source", "leads"];

// GET /api/saved-searches?scope=source|leads → saved searches for active module.
export const GET = apiHandler(async (req) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const scope = new URL(req.url).searchParams.get("scope") || "source";
  if (!SCOPES.includes(scope)) throw new ApiError("Invalid scope.", 400);
  return NextResponse.json({ searches: listSavedSearches({ module: getActiveModule(), scope }) });
});

// POST { scope, name, params } → save a search for the active module.
export const POST = apiHandler(async (req) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const { scope, name, params } = await req.json();
  if (!SCOPES.includes(scope)) throw new ApiError("Invalid scope.", 400);
  if (!name || !String(name).trim()) throw new ApiError("Name is required.", 400);
  if (params == null || typeof params !== "object") throw new ApiError("params must be an object.", 400);
  const { id } = createSavedSearch({
    module: getActiveModule(),
    scope,
    name: String(name).trim().slice(0, 80),
    params,
  });
  return NextResponse.json({ ok: true, id });
});
