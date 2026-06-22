import { NextResponse } from "next/server";
import { updateSequence, deleteSequence } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { name, steps } = await req.json();
    const sequence = updateSequence(Number(params.id), { name, steps });
    if (!sequence) return NextResponse.json({ error: "Cadence not found." }, { status: 404 });
    return NextResponse.json({ sequence });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not update cadence." }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    deleteSequence(Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not delete cadence." }, { status: 500 });
  }
}
