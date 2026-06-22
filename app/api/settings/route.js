import { NextResponse } from "next/server";
import { getSettings, saveSettings, getApiKeys } from "@/lib/db";
import { isMockMode } from "@/lib/anthropic";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const keys = getApiKeys();
    return NextResponse.json({
      settings: getSettings(),
      mockMode: isMockMode(),
      // Presence-only — the actual key strings are never sent to the browser.
      hasAnthropicKey: !!(keys.anthropicKey || process.env.ANTHROPIC_API_KEY),
      hasGeminiKey: !!(keys.geminiKey || process.env.GEMINI_API_KEY),
    });
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
      aiProvider: body.aiProvider === "gemini" ? "gemini" : body.aiProvider === "anthropic" ? "anthropic" : undefined,
      // Keys are optional: only written when the user explicitly submits them.
      // An empty string clears a previously stored key.
      ...(body.anthropicKey !== undefined ? { anthropicKey: (body.anthropicKey || "").trim() } : {}),
      ...(body.geminiKey !== undefined ? { geminiKey: (body.geminiKey || "").trim() } : {}),
    });
    const keys = getApiKeys();
    return NextResponse.json({
      settings,
      hasAnthropicKey: !!(keys.anthropicKey || process.env.ANTHROPIC_API_KEY),
      hasGeminiKey: !!(keys.geminiKey || process.env.GEMINI_API_KEY),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not save settings." },
      { status: 500 }
    );
  }
}
