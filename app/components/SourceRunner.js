"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateTime } from "./format";

const PIPELINE_META = {
  deliver: { label: "Deliver", cls: "bg-blue-50 text-accent", hint: "your team" },
  sell: { label: "Sell", cls: "bg-violet-50 text-violet-700", hint: "to partner" },
};

const SOURCE_GROUPS = [
  { key: "deliver", title: "Deliver — you fulfill (SMB)" },
  { key: "sell", title: "Sell — you broker (enterprise)" },
];

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

const SECTION_TONES = {
  accent: "bg-accent/10 text-accent",
  green: "bg-green-100 text-green-700",
  violet: "bg-violet-100 text-violet-700",
  amber: "bg-amber-100 text-amber-700",
};

function SectionHeader({ n, title, desc, right, tone = "accent" }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${SECTION_TONES[tone]}`}>
          {n}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {desc && <p className="text-xs text-muted">{desc}</p>}
        </div>
      </div>
      {right}
    </div>
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

function LeadRow({ lead, fresh }) {
  return (
    <tr className={`border-t border-line align-middle ${fresh ? "bg-amber-50/60" : "even:bg-[#fafaf8]"}`}>
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
    </tr>
  );
}

function LeadTable({ leads, runningFirst }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f3f3f0] text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Business</th>
            <th className="px-3 py-2 font-medium">Signal</th>
            <th className="px-3 py-2 font-medium">Contact</th>
            <th className="px-3 py-2 font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Track</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l, i) => (
            <LeadRow key={l.id || i} lead={l} fresh={runningFirst && i === 0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SourceRunner({ adapters, initialLeads, runs = [], stats }) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState(adapters[0]?.id || "");
  const [term, setTerm] = useState("");
  const [location, setLocation] = useState("");
  const [limit, setLimit] = useState(12);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null); // {found, added, mock, label, pipeline, done}
  const [live, setLive] = useState([]); // streamed leads (newest first)
  const [error, setError] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const esRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const selected = adapters.find((a) => a.id === sourceId);
  const lastRun = runs[0] || null;

  const filtered = useMemo(() => {
    let rows =
      pipelineFilter === "all"
        ? initialLeads
        : initialLeads.filter((l) => l.pipeline === pipelineFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((l) =>
        [l.name, l.signal, l.contact, l.category, l.city]
          .some((v) => (v || "").toLowerCase().includes(q))
      );
    }
    return rows;
  }, [initialLeads, pipelineFilter, query]);

  function run() {
    if (running || !sourceId) return;
    setError("");
    setLive([]);
    setStatus(null);
    setRunning(true);
    doneRef.current = false;

    const params = new URLSearchParams({ source: sourceId, term, location, limit: String(limit) });
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

  const dupes = status ? Math.max(0, (status.found || 0) - (status.added || 0)) : 0;

  return (
    <div className="space-y-8">
      {/* ---- KPI strip ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card border-accent2/20 bg-gradient-to-br from-accent2/10 to-transparent p-4">
          <div className="text-2xl font-bold tracking-tight text-accent2">{stats.total}</div>
          <div className="text-xs text-muted">Total sourced</div>
        </div>
        <div className="card border-blue-100 bg-gradient-to-br from-blue-50 to-transparent p-4">
          <div className="text-2xl font-bold tracking-tight text-accent">{stats.deliver}</div>
          <div className="text-xs text-muted">Deliver track</div>
        </div>
        <div className="card border-violet-100 bg-gradient-to-br from-violet-50 to-transparent p-4">
          <div className="text-2xl font-bold tracking-tight text-violet-700">{stats.sell}</div>
          <div className="text-xs text-muted">Sell track</div>
        </div>
        <div className="card border-green-100 bg-gradient-to-br from-green-50 to-transparent p-4">
          {lastRun ? (
            <>
              <div className="text-sm font-semibold text-success">
                +{lastRun.added} new
                {mounted && <span className="ml-1 font-normal text-muted">· {timeAgo(lastRun.createdAt)}</span>}
              </div>
              <div className="truncate text-xs text-muted">Last run · {lastRun.source}</div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-muted">No runs yet</div>
              <div className="text-xs text-muted">Last run</div>
            </>
          )}
        </div>
      </div>

      {/* ---- 1 · Choose a source ---- */}
      <section>
        <SectionHeader n={1} tone="accent" title="Choose a source" desc="Each source feeds one pipeline. Deliver = you build it; Sell = you broker it." />
        <div className="space-y-4">
          {SOURCE_GROUPS.map((g) => {
            const items = adapters.filter((a) => a.pipeline === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key}>
                <div className="mb-2 flex items-center gap-2">
                  <PipelineBadge pipeline={g.key} />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">{g.title}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((a) => {
                    const active = a.id === sourceId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSourceId(a.id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          active ? "border-accent bg-accent/5 ring-1 ring-accent/30" : "border-line bg-white hover:bg-[#f7f7f5]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">{a.label}</span>
                          {active && <span className="text-[11px] font-semibold text-accent">Selected</span>}
                        </div>
                        <p className="mt-1 text-xs text-muted">{a.description}</p>
                        <div className="mt-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              a.ready ? "bg-green-50 text-success" : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {a.ready ? "● Live API" : `◌ Simulated (set ${a.requiresKey})`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- 2 · Configure & run ---- */}
      <section>
        <SectionHeader
          n={2}
          tone="green"
          title="Configure & run"
          desc="Leads stream in live, are deduped, and saved to your database below."
          right={
            selected && (
              <span className="flex items-center gap-2 text-xs text-muted">
                Running into <PipelineBadge pipeline={selected.pipeline} />
              </span>
            )
          }
        />
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">
                {selected?.pipeline === "sell" ? "Service / vertical" : "Niche"}
              </span>
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={selected?.pipeline === "sell" ? "fintech, healthcare…" : "plumbers, dentists…"}
                className="w-48 rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Location</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Mumbai, US, UK…"
                className="w-40 rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Count</span>
              <input
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="w-20 rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            {running ? (
              <button type="button" onClick={stop} className="btn-ghost">Stop</button>
            ) : (
              <button type="button" onClick={run} className="btn-primary">Run sourcing</button>
            )}
          </div>

          {/* Live status */}
          {status && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-canvas px-4 py-3 text-sm">
              <span className="relative flex h-2.5 w-2.5">
                {running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${running ? "bg-accent" : status.done ? "bg-success" : "bg-neutral-300"}`} />
              </span>
              <span className="font-medium text-ink">{running ? "Sourcing…" : status.done ? "Done" : "Idle"}</span>
              <span className="text-muted">{status.found} found · {status.added} new</span>
              {status.label && <PipelineBadge pipeline={status.pipeline} />}
              {status.mock && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  Simulated data
                </span>
              )}
              {status.done && (
                <span className="font-medium text-success">
                  ✓ {status.added} new{dupes > 0 ? `, ${dupes} duplicate${dupes > 1 ? "s" : ""} skipped` : ""}
                </span>
              )}
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}

          {/* Live stream */}
          {live.length > 0 && <LeadTable leads={live} runningFirst={running} />}
        </div>
      </section>

      {/* ---- 3 · Sourced leads ---- */}
      <section>
        <SectionHeader
          n={3}
          tone="violet"
          title="Sourced leads"
          desc="Your deduped lead database across all runs."
          right={<span className="text-xs text-muted">{filtered.length} shown</span>}
        />
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-xs">
              {["all", "deliver", "sell"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPipelineFilter(p)}
                  className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                    pipelineFilter === p ? "bg-accent/10 text-accent" : "text-muted hover:text-ink"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search business, signal, contact…"
              className="w-64 rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              {initialLeads.length === 0
                ? "No sourced leads yet. Pick a source above and run it."
                : "No leads match your filter."}
            </p>
          ) : (
            <LeadTable leads={filtered} />
          )}
        </div>
      </section>

      {/* ---- 4 · Run history ---- */}
      <section>
        <SectionHeader n={4} tone="amber" title="Run history" desc="Every sourcing run, with what it found." />
        <div className="card p-5">
          {runs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No runs yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f3f3f0] text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Track</th>
                    <th className="px-3 py-2 font-medium">Query</th>
                    <th className="px-3 py-2 font-medium">Found</th>
                    <th className="px-3 py-2 font-medium">New</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-line align-middle even:bg-[#fafaf8]">
                      <td className="px-3 py-2 text-muted">{fmtDateTime(r.createdAt)}</td>
                      <td className="px-3 py-2 text-ink">{r.source}</td>
                      <td className="px-3 py-2"><PipelineBadge pipeline={r.pipeline} /></td>
                      <td className="px-3 py-2 text-muted">{r.query || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.found}</td>
                      <td className="px-3 py-2 tabular-nums">{r.added}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
