import { NextResponse } from "next/server";
import { deleteSavedSearch, touchSavedSearch } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

export const DELETE = apiHandler(async (_req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new ApiError("Invalid id.", 400);
  deleteSavedSearch(id);
  return NextResponse.json({ ok: true });
});

// PATCH → mark this saved search as just-used (re-orders the list).
export const PATCH = apiHandler(async (_req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new ApiError("Invalid id.", 400);
  touchSavedSearch(id);
  return NextResponse.json({ ok: true });
});
