"use client";

import { useEffect, useRef, useState } from "react";
import ErrorAlert from "@/app/components/ErrorAlert";
import PageHeader from "@/app/components/PageHeader";
import SecuritySettings from "@/app/components/SecuritySettings";
import ApiManagement from "@/app/components/ApiManagement";
import { toast } from "@/app/components/toast";
import { ACCENTS, DEFAULT_ACCENT } from "@/app/components/theme";

const FIELDS = [
  { key: "name", label: "Your name", placeholder: "e.g. Vikas Sharma" },
  { key: "location", label: "Location / base", placeholder: "e.g. Agra, UP" },
  {
    key: "services",
    label: "Services offered",
    placeholder: "e.g. Websites, Google Business setup, lead-capture pages",
  },
  {
    key: "priceRange",
    label: "Price range",
    placeholder: "e.g. ₹8,000 – ₹25,000",
  },
  {
    key: "portfolioLine",
    label: "Portfolio / proof line",
    placeholder: "e.g. Built 30+ sites for Agra businesses; avg 2x more enquiries",
  },
];

// Live-preview the accent by setting the CSS vars on <html> (overrides the
// server-injected :root rule until the page reloads with the saved value).
function applyAccent(key) {
  const a = ACCENTS[key] || ACCENTS[DEFAULT_ACCENT];
  document.documentElement.style.setProperty("--accent", a.accent);
  document.documentElement.style.setProperty("--accent2", a.accent2);
}

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: "",
    location: "",
    services: "",
    priceRange: "",
    portfolioLine: "",
    brandName: "",
    accentKey: "blue",
    aiProvider: "anthropic",
  });
  // Key fields are kept separate: never pre-filled, always write-only
  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mock, setMock] = useState(false);
  // Last *saved* accent — used to revert an unsaved live-preview on leave.
  const savedAccentRef = useRef("blue");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setForm((f) => ({ ...f, ...d.settings }));
          savedAccentRef.current = d.settings.accentKey || "blue";
        }
        setMock(!!d.mockMode);
        setHasAnthropicKey(!!d.hasAnthropicKey);
        setHasGeminiKey(!!d.hasGeminiKey);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // On leave, re-apply the saved accent so an un-saved preview doesn't stick.
  useEffect(() => () => applyAccent(savedAccentRef.current), []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = { ...form };
      // Only include key fields when the user typed something; empty string = clear key.
      if (anthropicKey !== "") body.anthropicKey = anthropicKey;
      if (geminiKey !== "") body.geminiKey = geminiKey;
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      savedAccentRef.current = form.accentKey || "blue";
      if (data.hasAnthropicKey !== undefined) setHasAnthropicKey(data.hasAnthropicKey);
      if (data.hasGeminiKey !== undefined) setHasGeminiKey(data.hasGeminiKey);
      // Re-check mock mode after a key save.
      setMock(!data.hasAnthropicKey && !data.hasGeminiKey);
      setAnthropicKey(""); setGeminiKey(""); // clear input after save
      toast("Settings saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/"
        backLabel="Dashboard"
        title="Settings"
        subtitle="Your profile personalizes outreach; branding lets you white-label the app."
      />

      {/* API Keys — in-app key entry so non-developers can leave mock mode */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-ink">API Keys</h2>
        <p className="mt-1 text-sm text-muted">
          Enter keys here to enable live AI. Keys are stored in the local database and never
          sent back to the browser. Environment variables (<code className="rounded bg-[#f3f3f0] px-1">.env.local</code>) always take priority.
        </p>
        <div className="mt-4 space-y-4">
          {/* Anthropic */}
          <div>
            <div className="flex items-center gap-2">
              <label className="label mb-0" htmlFor="anthropicKey">Anthropic API key</label>
              {hasAnthropicKey
                ? <span className="badge bg-emerald-50 text-emerald-700">✓ Key saved</span>
                : <span className="badge bg-amber-50 text-amber-700">Not configured</span>}
            </div>
            <input
              id="anthropicKey"
              type="password"
              autoComplete="new-password"
              className="input mt-1 max-w-sm font-mono"
              placeholder={hasAnthropicKey ? "Leave blank to keep existing key" : "sk-ant-api03-…"}
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted">Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">console.anthropic.com</a>.</p>
          </div>
          {/* Gemini */}
          <div>
            <div className="flex items-center gap-2">
              <label className="label mb-0" htmlFor="geminiKey">Google Gemini API key</label>
              {hasGeminiKey
                ? <span className="badge bg-emerald-50 text-emerald-700">✓ Key saved</span>
                : <span className="badge bg-neutral-100 text-muted">Optional</span>}
            </div>
            <input
              id="geminiKey"
              type="password"
              autoComplete="new-password"
              className="input mt-1 max-w-sm font-mono"
              placeholder={hasGeminiKey ? "Leave blank to keep existing key" : "AIza…"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted">Get your key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">aistudio.google.com</a>.</p>
          </div>
        </div>
      </div>

      {/* AI connection status (provider-aware) */}
      {!loading &&
        (() => {
          const gem = form.aiProvider === "gemini";
          const envVar = gem ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
          const models = gem
            ? "Gemini 2.5 Pro for research, 2.5 Flash for the rest"
            : "Opus 4.8 for research, Sonnet 4.6 for the rest";
          return mock ? (
            <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">AI is in Simulated mode.</span> Leads,
              contacts, and copy are placeholders. To go live, set a valid
              <code className="mx-1 rounded bg-white/60 px-1">{envVar}</code>
              in <code className="rounded bg-white/60 px-1">.env.local</code> (server-side)
              and restart. Keys are configured on the server by design — never in the browser.
            </div>
          ) : (
            <div className="rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-semibold">✓ AI connected ({gem ? "Google Gemini" : "Anthropic Claude"}).</span>{" "}
              Live research and copy enabled ({models}).
            </div>
          );
        })()}

      {/* AI provider (global default — per-task routing lives in API Management) */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-ink">AI provider (default)</h2>
        <p className="mt-1 text-sm text-muted">
          Fallback provider for anything not set per-task below. Set the matching key in <code className="rounded bg-[#f3f3f0] px-1">.env.local</code>.
        </p>
        <div className="mt-4 max-w-sm">
          <label className="label" htmlFor="aiProvider">Provider</label>
          <select
            id="aiProvider"
            className="input"
            value={form.aiProvider || "anthropic"}
            onChange={(e) => setForm({ ...form, aiProvider: e.target.value })}
          >
            <option value="anthropic">Anthropic Claude — Opus 4.8 + Sonnet 4.6</option>
            <option value="gemini">Google Gemini — 2.5 Pro + 2.5 Flash</option>
          </select>
          <p className="mt-1 text-xs text-muted">
            {form.aiProvider === "gemini" ? "Needs GEMINI_API_KEY." : "Needs ANTHROPIC_API_KEY."}{" "}
            Save, then restart the server if you just added the key.
          </p>
        </div>
      </div>

      {/* API Management — per-task provider routing + usage/budgets */}
      <ApiManagement />

      {/* Branding / white-label */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-ink">Branding</h2>
        <p className="mt-1 text-sm text-muted">
          Rebrand the app for your agency — name and accent color apply everywhere.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="brandName">Brand name</label>
            <input
              id="brandName"
              className="input max-w-sm"
              placeholder="OutreachPilot"
              value={form.brandName || ""}
              onChange={(e) => setForm({ ...form, brandName: e.target.value })}
            />
          </div>
          <div>
            <span className="label">Accent color</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACCENTS).map(([key, a]) => {
                const selected = (form.accentKey || "blue") === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={a.label}
                    aria-pressed={selected}
                    title={a.label}
                    onClick={() => {
                      setForm({ ...form, accentKey: key });
                      applyAccent(key);
                    }}
                    className={`h-8 w-8 rounded-full ring-offset-2 transition ${
                      selected ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink/40"
                    }`}
                    style={{ backgroundColor: a.swatch }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sender profile */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-ink">Sender profile</h2>
        <p className="mt-1 text-sm text-muted">
          Injected into the message-writer so outreach is signed in your name.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={f.key}>{f.label}</label>
                {f.key === "services" || f.key === "portfolioLine" ? (
                  <textarea
                    id={f.key}
                    className="input min-h-20"
                    placeholder={f.placeholder}
                    value={form[f.key] || ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                ) : (
                  <input
                    id={f.key}
                    className="input"
                    placeholder={f.placeholder}
                    value={form[f.key] || ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <ErrorAlert message={error} />}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      {/* Security / login protection — self-contained (own fetch + save). */}
      <SecuritySettings />
    </div>
  );
}
