"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "./toast";

// Beginner "Generate Leads" flow: type a business type + city, then the app runs
// the whole journey (find -> check fit -> campaign -> write messages) and streams
// live progress. Ends on a ready-to-send campaign — it never sends for you.
const STAGES = [
  { key: "find", title: "Find businesses", note: "Sourcing" },
  { key: "qualify", title: "Check which are a good fit", note: "Qualifying" },
  { key: "campaign", title: "Create your campaign", note: "Grouping" },
  { key: "draft", title: "Write a message for each", note: "Drafting" },
];

const EXAMPLES = ["Roofers in Dallas", "Dentists in Pune", "SaaS startups in Bangalore", "Cafes in Austin"];

function StageRow({ stage, state }) {
  // state: 'idle' | 'running' | 'done'
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
        state === "done" ? "bg-success text-white" : state === "running" ? "bg-accent text-white" : "bg-neutral-200 text-muted"
      }`}>
        {state === "done" ? "✓" : state === "running" ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${state === "idle" ? "text-muted" : "text-ink"}`}>
          {stage.label || stage.title}
          <span className="ml-1.5 text-xs font-normal text-muted">({stage.note})</span>
        </div>
      </div>
    </div>
  );
}

export default function GenerateWizard({ mock }) {
  const router = useRouter();
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState({}); // key -> {status, label, count}
  const [result, setResult] = useState(null); // {campaignId, found, qualified, written}
  const [error, setError] = useState("");
  const esRef = useRef(null);

  function stateOf(key) {
    return stages[key]?.status || "idle";
  }

  function start(e) {
    e?.preventDefault();
    if (!niche.trim() || !city.trim()) {
      toast("Enter a business type and a city.", "error");
      return;
    }
    setRunning(true);
    setError("");
    setResult(null);
    setStages({});
    const params = new URLSearchParams({ niche: niche.trim(), city: city.trim() });
    const es = new EventSource(`/api/leads/generate?${params.toString()}`);
    esRef.current = es;

    es.addEventListener("step", (ev) => {
      const d = JSON.parse(ev.data);
      setStages((s) => ({ ...s, [d.key]: { status: d.status, label: d.label, count: d.count } }));
    });
    es.addEventListener("done", (ev) => {
      setResult(JSON.parse(ev.data));
      setRunning(false);
      es.close();
    });
    es.addEventListener("error", (ev) => {
      // Our own emitted error carries data; a transport drop does not.
      let msg = "The connection dropped. Any leads found so far were saved to your Leads page.";
      try { if (ev.data) msg = JSON.parse(ev.data).message; } catch { /* transport error */ }
      setError(msg);
      setRunning(false);
      es.close();
    });
  }

  function reset() {
    setResult(null); setError(""); setStages({}); setNiche(""); setCity("");
  }

  // Success screen
  if (result) {
    return (
      <div className="card-accent p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 className="h-display text-2xl text-ink">Your leads are ready</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Found <span className="font-semibold text-ink">{result.found}</span> businesses,
          {" "}<span className="font-semibold text-ink">{result.qualified}</span> a good fit, with
          {" "}<span className="font-semibold text-ink">{result.written}</span> message{result.written === 1 ? "" : "s"} written.
          Review each one and hit send — nothing goes out automatically.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/campaign/${result.campaignId}`} className="btn-primary px-6 py-2.5">Review &amp; send →</Link>
          <button type="button" onClick={reset} className="btn-ghost px-6 py-2.5">Generate more</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {mock && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Test mode.</span> You can try the full flow now with sample data.
          Add an AI key in <Link href="/settings" className="font-medium underline">Settings</Link> for real leads &amp; messages.
        </div>
      )}

      {/* The one simple form */}
      <form onSubmit={start} className="card-accent p-6">
        <h2 className="h-display text-xl text-ink">What kind of businesses do you want to reach?</h2>
        <p className="mt-1 text-sm text-muted">Type a business type and a city. The app does the rest.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="gw-niche">Business type</label>
            <input id="gw-niche" className="input text-base" placeholder="e.g. Roofers" value={niche} onChange={(e) => setNiche(e.target.value)} disabled={running} />
          </div>
          <div>
            <label className="label" htmlFor="gw-city">City</label>
            <input id="gw-city" className="input text-base" placeholder="e.g. Dallas" value={city} onChange={(e) => setCity(e.target.value)} disabled={running} />
          </div>
        </div>

        {!running && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => { const [n, c] = ex.split(" in "); setNiche(n); setCity(c || ""); }} className="rounded-full border border-line bg-white px-2.5 py-1 font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent">
                {ex}
              </button>
            ))}
          </div>
        )}

        <button type="submit" disabled={running} className="btn-primary mt-5 w-full py-3 text-base disabled:opacity-60">
          {running ? "Working…" : "✨ Generate leads"}
        </button>
        <p className="mt-2 text-center text-xs text-muted">Finds real businesses, checks fit, and drafts your messages — you review &amp; send.</p>
      </form>

      {/* Live progress */}
      {(running || Object.keys(stages).length > 0) && (
        <div className="card divide-y divide-line p-0">
          {STAGES.map((st) => (
            <StageRow key={st.key} stage={{ ...st, label: stages[st.key]?.label }} state={stateOf(st.key)} />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
          {error} <Link href="/leads" className="font-medium underline">View Leads →</Link>
        </div>
      )}
    </div>
  );
}
