import { NextResponse } from "next/server";
import { getLead, setLeadSuppressed } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";

// Toggle do-not-contact on a lead: { suppressed: boolean, reason?: string }.
export const POST = apiHandler(async (req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const id = Number(params.id);
  if (!getLead(id)) throw new ApiError("Lead not found.", 404);
  const { suppressed, reason } = await req.json();
  const lead = setLeadSuppressed(id, !!suppressed, reason || "");
  return NextResponse.json({ lead });
});
