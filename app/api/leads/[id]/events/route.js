import { NextResponse } from "next/server";
import { getLead, listLeadEvents } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

// Activity timeline for a lead (newest first).
export const GET = apiHandler(async (_req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  if (!getLead(id)) throw new ApiError("Lead not found.", 404);
  return NextResponse.json({ events: listLeadEvents(id) });
});
