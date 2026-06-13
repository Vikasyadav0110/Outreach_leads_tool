"use client";

import { useEffect, useState } from "react";
import ErrorAlert from "./ErrorAlert";
import { toast } from "./toast";

export default function SecuritySettings() {
  const [enabled, setEnabled] = useState(false);
  const [username, setUsername] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.config) {
          setEnabled(!!d.config.enabled);
          setUsername(d.config.username || "");
          setHasPassword(!!d.config.hasPassword);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setError("");
    if (password && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (enabled && !hasPassword && !password) {
      setError("Set a password before turning login protection on.");
      return;
    }
    setSaving(true);
    try {
      const body = { enabled, username };
      if (password) body.password = password;
      const res = await fetch("/api/auth/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setEnabled(!!data.config.enabled);
      setUsername(data.config.username || "");
      setHasPassword(!!data.config.hasPassword);
      setPassword("");
      setConfirm("");
      toast(data.config.enabled ? "Login protection is on." : "Login protection is off.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Security</h2>
          <p className="mt-1 text-sm text-muted">
            Require a login to use the app. Password is stored as a salted hash and is never returned by any API.
          </p>
        </div>
        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Login protection"
          onClick={() => setEnabled((v) => !v)}
          disabled={loading}
          className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-success" : "bg-neutral-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                enabled ? "bg-green-50 text-success" : "bg-neutral-100 text-muted"
              }`}
            >
              {enabled ? "● Protected" : "○ Open (no login)"}
            </span>
            {hasPassword && <span className="text-xs text-muted">Password is set</span>}
          </div>

          <div>
            <label className="label" htmlFor="auth-username">Login email</label>
            <input
              id="auth-username"
              className="input max-w-sm"
              placeholder="you@example.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="auth-password">
                {hasPassword ? "New password" : "Password"}
              </label>
              <input
                id="auth-password"
                type="password"
                className="input"
                placeholder={hasPassword ? "Leave blank to keep current" : "Choose a password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label" htmlFor="auth-confirm">Confirm password</label>
              <input
                id="auth-confirm"
                type="password"
                className="input"
                placeholder="Re-enter password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          {error && <ErrorAlert message={error} />}

          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save security"}
          </button>
        </div>
      )}
    </div>
  );
}
