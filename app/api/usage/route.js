import { NextResponse } from "next/server";
import { getSettings, saveSettings, usageSummary, spentSince } from "@/lib/db";
import { providerForTask } from "@/lib/anthropic";
import { requireApiAuth } from "@/lib/authGuard";
import {
  AI_TASKS,
  DEFAULT_TASK_PROVIDERS,
  isValidTaskId,
  isValidProvider,
  modelFor,
} from "@/lib/aiTasks";

export const runtime = "nodejs";

// Booleans only — key VALUES never cross the wire. A simulated Anthropic key
// (the demo prefix isMockMode checks for) counts as not configured.
function keyStatus() {
  const a = process.env.ANTHROPIC_API_KEY || "";
  return {
    anthropic: !!a && !a.startsWith("sk-ant-api03-8f5n"),
    gemini: !!process.env.GEMINI_API_KEY,
    places: !!process.env.GOOGLE_PLACES_API_KEY,
    apollo: !!process.env.APOLLO_API_KEY,
    hunter: !!process.env.HUNTER_API_KEY,
  };
}

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const s = getSettings();
    const cfg = { ...DEFAULT_TASK_PROVIDERS, ...(s.taskProviders || {}) };

    const tasks = AI_TASKS.map((t) => {
      const configured = isValidProvider(cfg[t.id]) ? cfg[t.id] : t.default;
      const effective = providerForTask(t.id); // after key-missing fallback
      return {
        id: t.id,
        label: t.label,
        desc: t.desc,
        provider: configured,
        effectiveProvider: effective,
        fellBack: effective !== configured,
        model: modelFor(t.id, effective),
      };
    });

    const usage = usageSummary();

    // Lifetime per-provider spend (all rows incl. historical) — shown as "spent".
    const spentByProvider = { anthropic: 0, gemini: 0 };
    for (const r of usage.byProvider || []) {
      if (r.provider === "gemini") spentByProvider.gemini = r.usd || 0;
      else spentByProvider.anthropic += r.usd || 0; // anthropic + historical/other
    }

    const budgets = {
      anthropic: s.budgetAnthropicUsd || 0,
      gemini: s.budgetGeminiUsd || 0,
    };
    const anchors = {
      anthropic: s.budgetAnthropicAnchor || "",
      gemini: s.budgetGeminiAnchor || "",
    };
    // The budget is anchored to the real console balance at the moment it was
    // set, so "remaining" counts ONLY spend since that anchor (not historical).
    const spentSinceAnchor = {
      anthropic: spentSince("anthropic", anchors.anthropic),
      gemini: spentSince("gemini", anchors.gemini),
    };
    const remaining = {
      anthropic: budgets.anthropic > 0 ? budgets.anthropic - spentSinceAnchor.anthropic : null,
      gemini: budgets.gemini > 0 ? budgets.gemini - spentSinceAnchor.gemini : null,
    };

    return NextResponse.json({
      tasks,
      usage,
      spentByProvider,
      spentSinceAnchor,
      anchors,
      budgets,
      remaining,
      keys: keyStatus(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not load usage." },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = await req.json();
    const patch = {};

    // Per-task provider overrides — merge onto current, ignoring junk so a bad
    // value can never corrupt the config or split a task across providers.
    if (body.taskProviders && typeof body.taskProviders === "object") {
      const cur = getSettings().taskProviders || {};
      const next = { ...cur };
      for (const [id, p] of Object.entries(body.taskProviders)) {
        if (isValidTaskId(id) && isValidProvider(p)) next[id] = p;
      }
      patch.taskProviders = next;
    }

    // Per-provider USD budgets (>= 0; 0 = unset). Setting/changing a budget
    // re-anchors it to NOW, so "remaining" tracks spend from the moment you
    // entered your real console balance.
    const cur = getSettings();
    const nowIso = new Date().toISOString();
    for (const [field, anchorField, prev] of [
      ["budgetAnthropicUsd", "budgetAnthropicAnchor", cur.budgetAnthropicUsd],
      ["budgetGeminiUsd", "budgetGeminiAnchor", cur.budgetGeminiUsd],
    ]) {
      if (body[field] != null) {
        const n = Number(body[field]);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            { error: `${field} must be a number ≥ 0.` },
            { status: 400 }
          );
        }
        patch[field] = n;
        // Re-anchor only when the value actually changes (or is first set).
        if (n !== prev) patch[anchorField] = n > 0 ? nowIso : "";
      }
    }

    saveSettings(patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not save." },
      { status: 500 }
    );
  }
}
