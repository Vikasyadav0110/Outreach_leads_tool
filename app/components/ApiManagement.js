"use client";

import { useEffect, useMemo, useState } from "react";
import { KpiCard } from "./charts";
import { fmtCost } from "./format";
import { toast } from "./toast";
import { providerLabel } from "@/lib/aiTasks";

// Self-contained API Management card: shows which provider/model runs each task,
// tokens + USD spent (per task + per provider), per-provider budgets with
// remaining, and lets the user change the provider for any task. All server
// data comes over /api/usage; no keys are ever exposed (booleans only).

function KeyChip({ label, ok }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-[#f3f3f0] text-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-neutral-300"}`} />
      {label} {ok ? "✓" : "— not set"}
    </span>
  );
}

// `budget` is anchored to the real console balance; `spentSince` is spend since
// it was set. Remaining = budget − spentSince. `lifetime` is total tracked spend.
function BudgetMeter({ label, spentSince, lifetime, budget }) {
  const has = budget > 0;
  const pct = has ? Math.min(100, (spentSince / budget) * 100) : 0;
  const over = has && spentSince > budget;
  const remaining = has ? budget - spentSince : null;
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs text-muted">
          {has ? `${fmtCost(spentSince)} / ${fmtCost(budget)}` : `${fmtCost(lifetime)} spent`}
        </span>
      </div>
      {has ? (
        <>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#f3f3f0]">
            <div
              className={`h-full rounded-full ${over ? "bg-danger" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className={`mt-1 text-xs ${over ? "text-danger" : "text-muted"}`}>
            {over
              ? `Over by ${fmtCost(spentSince - budget)} since you set the balance`
              : `${fmtCost(remaining)} remaining (since you set the balance)`}
          </div>
        </>
      ) : (
        <div className="mt-1 text-xs text-muted">Enter your real balance below to track remaining.</div>
      )}
    </div>
  );
}

export default function ApiManagement() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Local editable copies (committed on Save).
  const [providers, setProviders] = useState({}); // taskId -> provider
  const [budgets, setBudgets] = useState({ anthropic: "", gemini: "" });

  async function load() {
    setError("");
    try {
      const res = await fetch("/api/usage");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not load.");
      setData(d);
      setProviders(Object.fromEntries(d.tasks.map((t) => [t.id, t.provider])));
      setBudgets({
        anthropic: d.budgets.anthropic ? String(d.budgets.anthropic) : "",
        gemini: d.budgets.gemini ? String(d.budgets.gemini) : "",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Tokens/USD per (task, provider) from the ledger, keyed for quick lookup.
  const byTask = useMemo(() => {
    const m = {};
    for (const r of data?.usage?.byTask || []) {
      m[`${r.task}:${r.provider}`] = { tokens: r.tokens || 0, usd: r.usd || 0 };
    }
    return m;
  }, [data]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskProviders: providers,
          budgetAnthropicUsd: budgets.anthropic === "" ? 0 : Number(budgets.anthropic),
          budgetGeminiUsd: budgets.gemini === "" ? 0 : Number(budgets.gemini),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save.");
      toast("API settings saved.");
      await load();
    } catch (e) {
      setError(e.message);
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5">
        <h2 className="text-base font-semibold text-ink">API Management</h2>
        <p className="mt-4 text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const keys = data?.keys || {};
  const totals = data?.usage?.totals || { tokens: 0, usd: 0 };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">API Management</h2>
          <p className="mt-1 text-sm text-muted">
            Choose which AI runs each task, and track tokens / spend. Each task always
            uses exactly one provider per run.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <KeyChip label="Anthropic" ok={keys.anthropic} />
          <KeyChip label="Gemini" ok={keys.gemini} />
          <KeyChip label="Hunter (emails)" ok={keys.hunter} />
          <KeyChip label="Apollo" ok={keys.apollo} />
        </div>
      </div>

      {/* Spend totals + per-provider budgets */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Total spent" value={fmtCost(totals.usd)} tone="accent" />
        <KpiCard label="Total tokens" value={(totals.tokens || 0).toLocaleString()} tone="ink" />
        <KpiCard
          label="Tasks on Gemini"
          value={`${data.tasks.filter((t) => t.effectiveProvider === "gemini").length} / ${data.tasks.length}`}
          tone="accent2"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <BudgetMeter
          label="Anthropic (Claude)"
          spentSince={data.spentSinceAnchor?.anthropic || 0}
          lifetime={data.spentByProvider.anthropic}
          budget={data.budgets.anthropic}
        />
        <BudgetMeter
          label="Google Gemini"
          spentSince={data.spentSinceAnchor?.gemini || 0}
          lifetime={data.spentByProvider.gemini}
          budget={data.budgets.gemini}
        />
      </div>

      {/* Per-task routing table */}
      <div className="mt-5 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f3f3f0] text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 font-medium">Model used</th>
              <th className="px-3 py-2 font-medium text-right">Tokens</th>
              <th className="px-3 py-2 font-medium text-right">Spent</th>
            </tr>
          </thead>
          <tbody>
            {data.tasks.map((t) => {
              const u = byTask[`${t.id}:${t.effectiveProvider}`] || { tokens: 0, usd: 0 };
              return (
                <tr key={t.id} className="border-t border-line align-top even:bg-[#fafaf8]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{t.label}</div>
                    <div className="text-xs text-muted">{t.desc}</div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input py-1 text-sm"
                      value={providers[t.id] || t.provider}
                      onChange={(e) => setProviders({ ...providers, [t.id]: e.target.value })}
                    >
                      <option value="anthropic">Anthropic Claude</option>
                      <option value="gemini">Google Gemini</option>
                    </select>
                    {t.fellBack && (
                      <div className="mt-1 text-xs text-amber-600">
                        Using {providerLabel(t.effectiveProvider)} — {providerLabel(t.provider)} key missing
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-[#f3f3f0] px-1.5 py-0.5 text-xs text-ink">{t.model}</code>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">
                    {(u.tokens || 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{fmtCost(u.usd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Budget inputs — anchored to your REAL console balance */}
      <div className="mt-5 rounded-lg border border-line bg-[#fafaf8] p-4">
        <p className="text-xs text-muted">
          Neither provider exposes a live “credits remaining” API to your normal key.
          So: open the provider console, read your <span className="text-ink">real remaining balance</span>,
          and enter it below. The app then counts spend <span className="text-ink">from that moment</span> and shows what’s left.
          Re-enter it any time to re-sync.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="budgetAnthropic">
              Anthropic remaining balance (USD){" "}
              <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer" className="text-accent hover:underline">check ↗</a>
            </label>
            <input
              id="budgetAnthropic"
              type="number"
              min="0"
              step="0.01"
              className="input"
              placeholder="0 = don’t track"
              value={budgets.anthropic}
              onChange={(e) => setBudgets({ ...budgets, anthropic: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="budgetGemini">
              Gemini remaining balance (USD){" "}
              <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer" className="text-accent hover:underline">check ↗</a>
            </label>
            <input
              id="budgetGemini"
              type="number"
              min="0"
              step="0.01"
              className="input"
              placeholder="0 = don’t track"
              value={budgets.gemini}
              onChange={(e) => setBudgets({ ...budgets, gemini: e.target.value })}
            />
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        Spend is an estimate from list pricing (caching/taxes may differ). Going over
        shows a warning but never blocks a run. Changing a task’s provider needs the
        matching key on the server (<code className="rounded bg-[#f3f3f0] px-1">.env.local</code>).
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save API settings"}
        </button>
      </div>
    </div>
  );
}
