"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ErrorAlert from "./ErrorAlert";
import DomainTiles from "./DomainTiles";
import { PRESETS } from "./Brand";
import { toast } from "./toast";

const MODES = [
  ["ai", "Find leads with AI"],
  ["business", "Specific business"],
];

export default function NewCampaignCard() {
  const router = useRouter();
  const [mode, setMode] = useState("ai");
  const [domain, setDomain] = useState("local");
  const [city, setCity] = useState("");
  const [niche, setNiche] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setError("");
    if (mode === "ai" && (!city.trim() || !niche.trim())) {
      setError("City and niche are required.");
      return;
    }
    if (mode === "business" && (!city.trim() || !businessName.trim())) {
      setError("City and business name are required.");
      return;
    }
    setBusy(true);
    try {
      const body =
        mode === "ai"
          ? { domain, city, niche }
          : {
              domain,
              city,
              niche: businessName,
              business: { name: businessName, website },
            };
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start campaign.");
      // Don't auto-run the AI pipeline — that spends credits. Land on the
      // campaign and let the user click "Run Pipeline" when ready.
      toast("Campaign created — open it and click Run when ready.");
      router.push(`/campaign/${data.campaign.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-r from-accent/10 via-accent2/10 to-transparent px-6 pt-6 pb-5">
        <h2 className="h-display text-lg text-ink">Start New Campaign</h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "ai"
            ? "Let AI find and score real businesses in a city + niche, then write the outreach."
            : "Already have a business in mind? Add it and AI writes the outreach for it."}
        </p>
      </div>

      <div className="px-6 pb-6">
        {/* Mode toggle */}
        <div className="mb-5 inline-flex rounded-lg border border-line bg-[#f7f7f4] p-1 text-sm">
          {MODES.map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={busy}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                mode === m ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="label">Domain</label>
        <DomainTiles value={domain} onChange={setDomain} disabled={busy} />

        {mode === "ai" ? (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="city">City</label>
                <input id="city" className="input" placeholder="e.g. Agra" value={city} onChange={(e) => setCity(e.target.value)} disabled={busy} />
              </div>
              <div>
                <label className="label" htmlFor="niche">Niche</label>
                <input id="niche" className="input" placeholder="e.g. Tour Operators" value={niche} onChange={(e) => setNiche(e.target.value)} disabled={busy} />
              </div>
            </div>
            <div className="mt-4">
              <span className="label">Quick start</span>
              <div className="flex flex-wrap gap-2">
                {(PRESETS[domain] || []).map(([pCity, pNiche]) => (
                  <button
                    key={`${pCity}-${pNiche}`}
                    type="button"
                    disabled={busy}
                    onClick={() => { setCity(pCity); setNiche(pNiche); }}
                    className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted transition-colors duration-150 hover:border-accent/40 hover:text-ink disabled:opacity-60"
                  >
                    {pCity} · {pNiche}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="bizname">Business name</label>
              <input id="bizname" className="input" placeholder="e.g. Sharma Dental Care" value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="label" htmlFor="city2">City</label>
              <input id="city2" className="input" placeholder="e.g. Pune" value={city} onChange={(e) => setCity(e.target.value)} disabled={busy} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="bizweb">Website (optional)</label>
              <input id="bizweb" className="input" placeholder="e.g. sharmadental.in (or leave blank if none)" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={busy} />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4">
            <ErrorAlert message={error} />
          </div>
        )}

        <div className="mt-5">
          <button onClick={run} disabled={busy} className="btn-primary">
            {busy ? "Starting…" : mode === "ai" ? "Run Pipeline" : "Generate outreach"}
          </button>
        </div>
      </div>
    </div>
  );
}
