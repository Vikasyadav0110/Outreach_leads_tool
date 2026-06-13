import { NextResponse } from "next/server";
import { runPrepMeeting } from "@/lib/agents";
import { isValidDomain } from "@/lib/prompts";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { domain, lead, context } = await req.json();
    if (!isValidDomain(domain)) {
      return NextResponse.json({ error: "Invalid domain." }, { status: 400 });
    }
    if (!lead || typeof lead !== "object") {
      return NextResponse.json({ error: "Missing lead." }, { status: 400 });
    }

    const kit = await runPrepMeeting({ domain, lead, context: context || "" });
    return NextResponse.json({ kit });
  } catch (err) {
    const message = err?.message || "Agent 4 (Meeting Closer) failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
