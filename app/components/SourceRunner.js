"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateTime } from "./format";
import { toast } from "./toast";
import { KpiCard, ChartCard, HBarChart, AreaTrendChart } from "./charts";
import { CHART } from "./chartColors";
import { perWeek } from "@/lib/analytics";
import { RESEARCH_MODELS, DEFAULT_RESEARCH_MODEL } from "@/lib/researchModels";

const PIPELINE_META = {
  deliver: { label: "Deliver", cls: "bg-blue-50 text-accent", hint: "your team" },
  sell: { label: "Sell", cls: "bg-violet-50 text-violet-700", hint: "to partner" },
};

// Per-source recommended Count — balances result quality against credit cost.
const RECO_BY_SOURCE = {
  "claude-research": { count: 4, why: "keeps AI credits low while giving solid coverage" },
  apollo: { count: 3, why: "Apollo free tier is ~85/mo — small runs stretch it" },
  "google-places": { count: 10, why: "Google Places is cheap — go broader for coverage" },
  crunchbase: { count: 8, why: "balanced batch" },
  builtwith: { count: 8, why: "balanced batch" },
  "job-boards": { count: 8, why: "balanced batch" },
  marketplaces: { count: 8, why: "balanced batch" },
};

function PipelineBadge({ pipeline }) {
  const m = PIPELINE_META[pipeline] || PIPELINE_META.deliver;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

function ScoreDot({ score }) {
  const s = Number(score) || 0;
  const color = s >= 8 ? "bg-success" : s >= 6 ? "bg-warning" : "bg-neutral-300";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="tabular-nums">{s || "—"}</span>
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    done: "bg-green-50 text-success",
    running: "bg-blue-50 text-accent",
    error: "bg-red-50 text-danger",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${map[status] || "bg-neutral-100 text-muted"}`}>
      {status}
    </span>
  );
}

function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function LeadRow({ lead, fresh, onPush, pushing, selectable, selected, onToggle }) {
  return (
    <tr className={`border-t border-line align-middle ${selected ? "bg-accent/5" : fresh ? "bg-amber-50/60" : "even:bg-[#fafaf8]"}`}>
      {selectable && (
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(lead.id)}
            className="h-4 w-4 accent-[#1c5bd6]"
            aria-label={`Select ${lead.name}`}
          />
        </td>
      )}
      <td className="px-3 py-2">
        <div className="font-medium text-ink">{lead.name}</div>
        {lead.website ? (
          <a href={lead.website} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
            {lead.website.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-xs text-danger">no website</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-muted">{lead.signal || "—"}</td>
      <td className="px-3 py-2 text-sm">
        {lead.contact ? (
          <div>
            <div className="text-ink">{lead.contact}</div>
            <div className="text-xs text-muted">{lead.title || ""}</div>
          </div>
        ) : (
          <span className="text-muted">{lead.phone || "—"}</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm"><ScoreDot score={lead.score} /></td>
      <td className="px-3 py-2"><PipelineBadge pipeline={lead.pipeline} /></td>
      {onPush && (
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={() => onPush(lead)}
            disabled={pushing}
            className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/5 disabled:opacity-50"
            title="Create a campaign seeded with this lead"
          >
            {pushing ? "Pushing…" : "Push → campaign"}
          </button>
        </td>
      )}
    </tr>
  );
}

function LeadTable({ leads, runningFirst, onPush, pushingId, selectable, selectedIds, onToggle, onToggleAll }) {
  const allSelected = selectable && leads.length > 0 && leads.every((l) => selectedIds.has(l.id));
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f3f3f0] text-xs uppercase tracking-wide text-muted">
          <tr>
            {selectable && (
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(!allSelected)}
                  className="h-4 w-4 accent-[#1c5bd6]"
                  aria-label="Select all"
                />
              </th>
            )}
            <th className="px-3 py-2 font-medium">Business</th>
            <th className="px-3 py-2 font-medium">Signal</th>
            <th className="px-3 py-2 font-medium">Contact</th>
            <th className="px-3 py-2 font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Track</th>
            {onPush && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {leads.map((l, i) => (
            <LeadRow
              key={l.id || i}
              lead={l}
              fresh={runningFirst && i === 0}
              onPush={onPush}
              pushing={pushingId != null && pushingId === l.id}
              selectable={selectable}
              selected={selectable && selectedIds.has(l.id)}
              onToggle={onToggle}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SourceRunner({ adapters, initialLeads, runs = [], total = 0, moduleLabel, pipeline }) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState(adapters[0]?.id || "");
  const [term, setTerm] = useState("");
  const [location, setLocation] = useState("");
  const [limit, setLimit] = useState(12);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null); // {found, added, mock, label, pipeline, done}
  const [live, setLive] = useState([]); // streamed leads (newest first)
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [pushingId, setPushingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkPushing, setBulkPushing] = useState(false);
  const [icp, setIcp] = useState({ role: "", industry: "", tech: "" });
  const [prompt, setPrompt] = useState("");
  const [researchModel, setResearchModel] = useState(DEFAULT_RESEARCH_MODEL);
  const [mounted, setMounted] = useState(false);
  const isSell = pipeline === "sell";
  const esRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const selected = adapters.find((a) => a.id === sourceId);
  const isClaude = selected?.id === "claude-research";
  const reco = RECO_BY_SOURCE[selected?.id] || { count: 8, why: "a balanced batch for this source" };
  const lastRun = runs[0] || null;
  const liveSources = adapters.filter((a) => a.ready).length;

  const filtered = useMemo(() => {
    let rows = initialLeads;
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((l) =>
        [l.name, l.signal, l.contact, l.category, l.city]
          .some((v) => (v || "").toLowerCase().includes(q))
      );
    }
    return rows;
  }, [initialLeads, query]);

  // Insights derived from the persisted leads (client-side).
  const bySource = useMemo(() => {
    const m = new Map();
    for (const l of initialLeads) m.set(l.source || "—", (m.get(l.source || "—") || 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [initialLeads]);
  const weekData = useMemo(() => perWeek(initialLeads, "createdAt", () => 1), [initialLeads]);

  function run() {
    if (running || !sourceId) return;
    setError("");
    setLive([]);
    setStatus(null);
    setRunning(true);
    doneRef.current = false;

    const params = new URLSearchParams({ source: sourceId, term, location, limit: String(limit), pipeline });
    if (isClaude && prompt.trim()) {
      params.set("prompt", prompt.trim());
      params.set("model", researchModel);
    }
    if (isSell && !isClaude) {
      if (icp.role) params.set("role", icp.role);
      if (icp.industry) params.set("industry", icp.industry);
      if (icp.tech) params.set("tech", icp.tech);
    }
    const es = new EventSource(`/api/sources/ingest?${params.toString()}`);
    esRef.current = es;

    es.addEventListener("start", (e) => {
      const d = JSON.parse(e.data);
      setStatus({ found: 0, added: 0, mock: d.mock, label: d.label, pipeline: d.pipeline });
    });
    es.addEventListener("lead", (e) => {
      const d = JSON.parse(e.data);
      setStatus((s) => ({ ...(s || {}), found: d.found, added: d.added }));
      if (d.isNew) setLive((prev) => [d.lead, ...prev]);
    });
    es.addEventListener("done", (e) => {
      const d = JSON.parse(e.data);
      doneRef.current = true;
      setStatus((s) => ({ ...(s || {}), found: d.found, added: d.added, done: true }));
      es.close();
      setRunning(false);
      router.refresh(); // fold the new leads into the persisted table + history
    });
    es.addEventListener("error", (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d?.message) setError(d.message);
      } catch {
        if (!doneRef.current) setError("Connection lost during sourcing.");
      }
      es.close();
      setRunning(false);
    });
  }

  function stop() {
    esRef.current?.close();
    setRunning(false);
  }

  // Map a sourced lead → the full seed shape the campaign API expects, so
  // phone/score/signal/website all carry through (nothing is re-discovered).
  function seedOf(lead) {
    return {
      name: lead.name,
      website: lead.website || "",
      category: lead.category || "",
      city: lead.city || "",
      phone: lead.phone || "",
      contact: lead.contact || "",
      email: lead.email || "",
      score: lead.score,
      signal: lead.signal || "",
    };
  }

  // Promote ONE sourced lead into its own campaign (seeds it as a HIGH lead +
  // pre-filled qualification card) → enters Leads / Campaign / Dashboard.
  async function pushLead(lead) {
    setPushingId(lead.id);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "local",
          city: lead.city || "Unknown",
          niche: lead.category || "Sourced lead",
          leads: [seedOf(lead)],
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not push.");
      toast("Pushed to a new campaign — see it in Leads & Campaigns.");
      router.refresh();
    } catch (e) {
      toast(e.message || "Push failed.", "error");
    } finally {
      setPushingId(null);
    }
  }

  // Selection helpers for bulk push.
  function toggleOne(id) {
    setSelectedIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll(on) {
    setSelectedIds(on ? new Set(filtered.map((l) => l.id)) : new Set());
  }

  // Push ALL selected leads into ONE campaign (bulk) — no more one-campaign-
  // per-lead sprawl. City/niche come from the first selected lead.
  async function pushSelected() {
    const chosen = filtered.filter((l) => selectedIds.has(l.id));
    if (!chosen.length) return;
    setBulkPushing(true);
    try {
      const first = chosen[0];
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "local",
          city: first.city || "Unknown",
          niche: first.category || "Sourced leads",
          leads: chosen.map(seedOf),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not push.");
      toast(`Pushed ${d.seeded ?? chosen.length} leads into one campaign — see Leads & Campaigns.`);
      setSelectedIds(new Set());
      router.refresh();
    } catch (e) {
      toast(e.message || "Bulk push failed.", "error");
    } finally {
      setBulkPushing(false);
    }
  }

  const dupes = status ? Math.max(0, (status.found || 0) - (status.added || 0)) : 0;

  return (
    <div className="space-y-6">
      {/* ---- KPI strip ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label="Total sourced" value={total} tone="accent2" sub={moduleLabel} />
        <KpiCard label="Live sources" value={liveSources} tone="accent" sub={`${adapters.length} available`} />
        <KpiCard
          label={lastRun ? `Last run · ${lastRun.source}` : "Last run"}
          value={lastRun ? `+${lastRun.added}` : "—"}
          tone={lastRun ? "success" : "ink"}
          sub={lastRun && mounted ? timeAgo(lastRun.createdAt) : lastRun ? "new leads" : "no runs yet"}
        />
      </div>

      {/* ---- Workspace: control panel (left) + results (right) ---- */}
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Left — Run a search */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-ink">Run a search</h2>

            {/* Source picker — sources for this module */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Source</span>
              {adapters.length > 0 ? (
                adapters.map((a) => {
                  const active = a.id === sourceId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSourceId(a.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        active ? "border-accent bg-accent/5" : "border-line bg-white hover:bg-[#f7f7f5]"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${active ? "border-accent bg-accent" : "border-line"}`} />
                        <span className="font-medium text-ink">{a.label}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${a.ready ? "bg-green-50 text-success" : "bg-amber-50 text-amber-700"}`}>
                        {a.ready ? "Live" : "Sim"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-[#fafaf8] px-3 py-3 text-xs text-muted">
                  No source connected for {moduleLabel} yet. Connect a provider (Upwork API, jobs feed, RFP board) to enable sourcing for this module.
                </div>
              )}
            </div>

            {/* Form — grid aligned */}
            <div className="space-y-3 border-t border-line pt-4">
              {isClaude ? (
                <div>
                  <label className="label" htmlFor="src-prompt">Describe your ideal client</label>
                  <textarea
                    id="src-prompt"
                    className="input min-h-20"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Series-A fintech startups in the US hiring backend engineers"
                  />
                  <div className="mt-2">
                    <label className="label" htmlFor="src-model">Model</label>
                    <select
                      id="src-model"
                      className="input"
                      value={researchModel}
                      onChange={(e) => setResearchModel(e.target.value)}
                    >
                      {RESEARCH_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label} ({m.cost})</option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-amber-700">⚠ Uses AI credits — keep count low (max 6/run).</p>
                </div>
              ) : (
                <div>
                  <label className="label" htmlFor="src-term">
                    {isSell ? "Service / vertical" : "Niche"}
                  </label>
                  <input
                    id="src-term"
                    className="input"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder={isSell ? "fintech, healthcare…" : "plumbers, dentists…"}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="src-loc">Location</label>
                  <input id="src-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Mumbai, US…" />
                </div>
                <div>
                  <label className="label" htmlFor="src-count">Count</label>
                  <input
                    id="src-count"
                    type="number"
                    min={1}
                    max={50}
                    className="input"
                    value={limit}
                    onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>💡 Recommended count: <span className="font-semibold text-ink">{reco.count}</span></span>
                {limit !== reco.count && (
                  <button
                    type="button"
                    onClick={() => setLimit(reco.count)}
                    className="rounded border border-line bg-white px-1.5 py-0.5 font-medium text-accent transition-colors hover:bg-accent/5"
                  >
                    Use
                  </button>
                )}
                <span>· {reco.why}</span>
              </div>

              {isSell && !isClaude && (
                <div className="space-y-3 rounded-lg border border-line bg-[#fafaf8] p-3">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted">ICP filters (optional)</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="icp-role">Decision-maker</label>
                      <input id="icp-role" className="input" value={icp.role} onChange={(e) => setIcp({ ...icp, role: e.target.value })} placeholder="CTO, VP Eng…" />
                    </div>
                    <div>
                      <label className="label" htmlFor="icp-size">Industry</label>
                      <input id="icp-size" className="input" value={icp.industry} onChange={(e) => setIcp({ ...icp, industry: e.target.value })} placeholder="SaaS, fintech…" />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="icp-tech">Tech stack</label>
                    <input id="icp-tech" className="input" value={icp.tech} onChange={(e) => setIcp({ ...icp, tech: e.target.value })} placeholder="React, AWS, Shopify…" />
                  </div>
                </div>
              )}
              {selected?.id === "apollo" && (
                <p className="text-[11px] font-medium text-amber-700">⚠ Apollo free tier (~85 credits/mo) — capped to 5 per run; use sparingly.</p>
              )}
              {running ? (
                <button type="button" onClick={stop} className="btn-ghost w-full">Stop</button>
              ) : (
                <button type="button" onClick={run} disabled={!sourceId || (isClaude && !prompt.trim())} className="btn-primary w-full">Run sourcing</button>
              )}
            </div>

            {/* Live status */}
            {status && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm">
                <span className="relative flex h-2.5 w-2.5">
                  {running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />}
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${running ? "bg-accent" : status.done ? "bg-success" : "bg-neutral-300"}`} />
                </span>
                <span className="font-medium text-ink">{running ? "Sourcing…" : status.done ? "Done" : "Idle"}</span>
                <span className="text-muted">{status.found} found · {status.added} new</span>
                {status.mock && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Simulated</span>
                )}
                {status.done && dupes > 0 && (
                  <span className="text-xs text-muted">{dupes} dup{dupes > 1 ? "s" : ""} skipped</span>
                )}
              </div>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </aside>

        {/* Right — results */}
        <div className="min-w-0 space-y-4">
          {live.length > 0 && (
            <div className="card p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">Live results</h2>
                {status && <span className="text-xs text-muted">{status.found} found · {status.added} new</span>}
              </div>
              <LeadTable leads={live} runningFirst={running} />
            </div>
          )}

          <div className="card p-5">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">
                Sourced leads <span className="font-normal text-muted">· {filtered.length} shown</span>
              </h2>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search business, signal, contact…"
                className="w-56 rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <p className="mb-3 text-xs text-muted">
              These are your raw finds. <span className="text-ink">Push</span> the ones worth
              working into a campaign — they’ll then appear in <span className="text-ink">Leads</span> and{" "}
              <span className="text-ink">Campaigns</span> with their phone &amp; signal carried over.
            </p>

            {/* Bulk action bar — appears once you select leads */}
            {selectedIds.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
                <span className="text-sm text-ink">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="rounded-md px-2 py-1 text-xs text-muted hover:text-ink"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={pushSelected}
                    disabled={bulkPushing}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1647b8] disabled:opacity-50"
                  >
                    {bulkPushing ? "Pushing…" : `Push ${selectedIds.size} → one campaign`}
                  </button>
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                {initialLeads.length === 0
                  ? "No sourced leads yet. Pick a source and run it."
                  : "No leads match your filter."}
              </p>
            ) : (
              <LeadTable
                leads={filtered}
                onPush={pushLead}
                pushingId={pushingId}
                selectable
                selectedIds={selectedIds}
                onToggle={toggleOne}
                onToggleAll={toggleAll}
              />
            )}
          </div>
        </div>
      </div>

      {/* ---- Insights ---- */}
      {initialLeads.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink">Insights</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Leads by source">
              <HBarChart data={bySource} color={CHART.accent} height={165} />
            </ChartCard>
            <ChartCard title="Sourced per week">
              <AreaTrendChart data={weekData} color={CHART.accent2} height={165} />
            </ChartCard>
          </div>
        </div>
      )}

      {/* ---- Run history ---- */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">Run history</h2>
        <div className="card p-5">
          {runs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No runs yet.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Source</th>
                    <th>Track</th>
                    <th>Query</th>
                    <th>Found</th>
                    <th>New</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted">{fmtDateTime(r.createdAt)}</td>
                      <td className="text-ink">{r.source}</td>
                      <td><PipelineBadge pipeline={r.pipeline} /></td>
                      <td className="text-muted">{r.query || "—"}</td>
                      <td className="tabular-nums">{r.found}</td>
                      <td className="tabular-nums">{r.added}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
