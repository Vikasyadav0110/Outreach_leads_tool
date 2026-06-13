"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APP_NAME } from "./Brand";

export default function LoginForm({ defaultUsername = "" }) {
  const router = useRouter();
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Login failed.");
      const from = new URLSearchParams(window.location.search).get("from") || "/";
      router.push(from);
      router.refresh();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-sm font-bold text-white shadow-sm">
          {APP_NAME.charAt(0)}
        </span>
        <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-lg font-bold tracking-tight text-transparent">
          {APP_NAME}
        </span>
      </div>
      <h1 className="h-display mt-4 text-lg text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Enter your email and password to continue.</p>

      <label className="label mt-4" htmlFor="login-email">Email</label>
      <input
        id="login-email"
        type="email"
        className="input"
        placeholder="you@example.com"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
      />

      <label className="label mt-3" htmlFor="login-pw">Password</label>
      <input
        id="login-pw"
        type="password"
        className="input"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        autoFocus={!!defaultUsername}
      />

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button type="submit" className="btn-primary mt-4 w-full" disabled={busy || !username || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
