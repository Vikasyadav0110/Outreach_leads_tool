import { NextResponse } from "next/server";
import { listSnippets, createSnippet } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    return NextResponse.json({ snippets: listSnippets() });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not load templates." },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { title, channel, body } = await req.json();
    if (!body || !body.trim()) {
      return NextResponse.json({ error: "Template body is required." }, { status: 400 });
    }
    const snippet = createSnippet({ title, channel, body });
    return NextResponse.json({ snippet });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not save template." },
      { status: 500 }
    );
  }
}
