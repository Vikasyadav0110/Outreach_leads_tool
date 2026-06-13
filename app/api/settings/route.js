import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    return NextResponse.json({ settings: getSettings(), mockMode: isMockMode() });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not load settings." },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = await req.json();
    const settings = saveSettings({
      name: body.name,
      location: body.location,
      services: body.services,
      priceRange: body.priceRange,
      portfolioLine: body.portfolioLine,
      brandName: body.brandName,
      accentKey: body.accentKey,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not save settings." },
      { status: 500 }
    );
  }
}
