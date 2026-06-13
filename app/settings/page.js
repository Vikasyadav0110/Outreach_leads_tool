"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ErrorAlert from "@/app/components/ErrorAlert";
import SecuritySettings from "@/app/components/SecuritySettings";
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
  });
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
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      savedAccentRef.current = form.accentKey || "blue";
      toast("Settings saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Dashboard
        </Link>
        <h1 className="h-display mt-1 text-xl text-ink">Settings</h1>
        <p className="text-sm text-muted">
          Your profile personalizes outreach; branding lets you white-label the app.
        </p>
      </div>

      {/* AI connection status */}
      {!loading &&
        (mock ? (
          <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">AI is in Simulated mode.</span> Leads,
            contacts, and copy are placeholders. To go live, set a valid
            <code className="mx-1 rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code>
            in <code className="rounded bg-white/60 px-1">.env.local</code> (server-side)
            and restart. Keys are configured on the server by design — they're never
            entered or stored in the browser.
          </div>
        ) : (
          <div className="rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="font-semibold">✓ AI connected.</span> Live research and
            copy are enabled (Opus 4.8 for research, Sonnet 4.6 for the rest).
          </div>
        ))}

      {/* Branding / white-label */}
      <div className="card p-6">
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
      <div className="card p-6">
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
