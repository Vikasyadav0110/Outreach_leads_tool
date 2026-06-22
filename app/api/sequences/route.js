import { NextResponse } from "next/server";
import { listSequences, createSequence } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";
import { getActiveModule } from "@/lib/activeModule";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    return NextResponse.json({ sequences: listSequences(getActiveModule()) });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not load cadences." }, { status: 500 });
  }
}

export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { name, steps } = await req.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Cadence name is required." }, { status: 400 });
    }
    const sequence = createSequence({ module: getActiveModule(), name, steps });
    return NextResponse.json({ sequence });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not save cadence." }, { status: 500 });
  }
}
