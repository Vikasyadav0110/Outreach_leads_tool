import { NextResponse } from "next/server";
import { deleteSnippet, bumpSnippetUse } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

// Increment usage count (called when a template is inserted).
export async function PATCH(_req, { params }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    bumpSnippetUse(Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not update template." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req, { params }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    deleteSnippet(Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not delete template." },
      { status: 500 }
    );
  }
}
