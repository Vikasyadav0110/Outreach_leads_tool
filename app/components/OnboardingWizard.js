"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DomainTiles from "./DomainTiles";
import { PRESETS } from "./Brand";
import ErrorAlert from "./ErrorAlert";
import { toast } from "./toast";

const STEPS = ["Your profile", "AI status", "First campaign"];

function Stepper({ step }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                active
                  ? "bg-gradient-to-br from-accent to-accent2 text-white"
                  : done
                  ? "bg-success text-white"
                  : "bg-neutral-100 text-muted"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={`text-xs font-medium ${active ? "text-ink" : "text-muted"}`}>
              {label}
            </span>
            {n < STEPS.length && <span className="mx-1 h-px w-5 bg-line" />}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingWizard({ mock, onSkip }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState({
    name: "",
    location: "",
    services: "",
    priceRange: "",
    portfolioLine: "",
  });
  const [domain, setDomain] = useState("local");
  const [city, setCity] = useState("");
  const [niche, setNiche] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => d.settings && setProfile(d.settings))
      .catch(() => {});
  }, []);

  async function saveProfile() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("Could not save your profile.");
      toast("Profile saved.");
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function createCampaign() {
    setError("");
    if (!city.trim() || !niche.trim()) {
      setError("City and niche are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, city, niche }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start campaign.");
      toast("Campaign created — running pipeline…");
      router.push(`/campaign/${data.campaign.id}?autorun=1`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const set = (k) => (e) => setProfile({ ...profile, [k]: e.target.value });

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 bg-gradient-to-r from-accent/10 via-accent2/10 to-transparent px-6 pt-6 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="h-display text-lg text-ink">Welcome to OutreachPilot 👋</h2>
          <p className="mt-1 text-sm text-muted">
            Three quick steps and your first campaign is running.
          </p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="self-start text-xs font-medium text-muted hover:text-ink"
        >
          Skip setup →
        </button>
      </div>

      <div className="px-6 pb-6 pt-5">
        <Stepper step={step} />

        <div className="mt-6">
          {/* Step 1 — profile */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Your profile is injected into the message-writer so outreach is
                personalized and signed in your name.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ob-name">Your name</label>
                  <input id="ob-name" className="input" placeholder="e.g. Vikas Sharma" value={profile.name || ""} onChange={set("name")} />
                </div>
                <div>
                  <label className="label" htmlFor="ob-loc">Location / base</label>
                  <input id="ob-loc" className="input" placeholder="e.g. Agra, UP" value={profile.location || ""} onChange={set("location")} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="ob-svc">Services offered</label>
                <textarea id="ob-svc" className="input min-h-20" placeholder="e.g. Websites, Google Business setup, lead-capture pages" value={profile.services || ""} onChange={set("services")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ob-price">Price range</label>
                  <input id="ob-price" className="input" placeholder="e.g. ₹8,000 – ₹25,000" value={profile.priceRange || ""} onChange={set("priceRange")} />
                </div>
                <div>
                  <label className="label" htmlFor="ob-proof">Portfolio / proof line</label>
                  <input id="ob-proof" className="input" placeholder="e.g. Built 30+ sites for Agra businesses" value={profile.portfolioLine || ""} onChange={set("portfolioLine")} />
                </div>
              </div>
              {error && <ErrorAlert message={error} />}
              <div className="flex items-center gap-3">
                <button className="btn-primary" onClick={saveProfile} disabled={busy}>
                  {busy ? "Saving…" : "Save & continue"}
                </button>
                <button className="text-sm font-medium text-muted hover:text-ink" onClick={() => setStep(2)}>
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — AI status */}
          {step === 2 && (
            <div className="space-y-4">
              {mock ? (
                <div className="rounded-card border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-700">⚠️ Simulated Fallback mode</p>
                  <p className="mt-1 text-sm text-amber-700/90">
                    The app is generating <strong>mock</strong> results — great for a
                    test drive. For live AI research and copy, add a valid
                    <code className="mx-1 rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code>
                    to <code className="rounded bg-white/60 px-1">.env.local</code> and restart.
                  </p>
                </div>
              ) : (
                <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-700">✓ AI connected</p>
                  <p className="mt-1 text-sm text-emerald-700/90">
                    Your Anthropic key is configured. Lead research runs on Claude
                    Opus 4.8; qualifying, copy, and meeting prep run on Sonnet 4.6.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button className="btn-ghost" onClick={() => setStep(1)}>← Back</button>
                <button className="btn-primary" onClick={() => setStep(3)}>Continue</button>
              </div>
            </div>
          )}

          {/* Step 3 — first campaign */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="label">Domain</label>
                <DomainTiles value={domain} onChange={setDomain} disabled={busy} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ob-city">City</label>
                  <input id="ob-city" className="input" placeholder="e.g. Agra" value={city} onChange={(e) => setCity(e.target.value)} disabled={busy} />
                </div>
                <div>
                  <label className="label" htmlFor="ob-niche">Niche</label>
                  <input id="ob-niche" className="input" placeholder="e.g. Tour Operators" value={niche} onChange={(e) => setNiche(e.target.value)} disabled={busy} />
                </div>
              </div>
              <div>
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
              {error && <ErrorAlert message={error} />}
              <div className="flex items-center gap-3">
                <button className="btn-ghost" onClick={() => setStep(2)} disabled={busy}>← Back</button>
                <button className="btn-primary" onClick={createCampaign} disabled={busy}>
                  {busy ? "Starting…" : "Create & run pipeline"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
