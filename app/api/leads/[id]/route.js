import { NextResponse } from "next/server";
import { getLead, patchLead } from "@/lib/db";
import { LIFECYCLE_KEYS } from "@/app/components/status";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

// GET one lead (with its qualification card projection + deal).
export const GET = apiHandler(async (_req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const lead = getLead(Number(params.id));
  if (!lead) throw new ApiError("Lead not found.", 404);
  return NextResponse.json({ lead });
});

// PATCH editable fields: decisionMaker / email / whatsapp / status / notes / deal.
export const PATCH = apiHandler(async (req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  if (!getLead(id)) throw new ApiError("Lead not found.", 404);
  const body = await req.json();
  if (body.status != null && !LIFECYCLE_KEYS.includes(body.status)) {
    throw new ApiError("Invalid status.", 400);
  }
  if (body.deal != null && typeof body.deal !== "object") {
    throw new ApiError("Invalid deal.", 400);
  }
  const lead = patchLead(id, body);
  return NextResponse.json({ lead });
});
