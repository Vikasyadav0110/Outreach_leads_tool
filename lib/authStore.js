// Node-only auth credential store. Owns the password hash + session secret and
// is the ONLY module that touches them. Never returns the hash/secret to callers
// that serialize to the client (getAuthConfig is the safe, public-facing shape).
import crypto from "node:crypto";
import { getAuthRow, saveAuthRow } from "./db";

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const want = Buffer.from(hash, "hex");
  let got;
  try {
    got = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// Safe, client-facing config — no hash, no secret.
export function getAuthConfig() {
  const row = getAuthRow();
  return {
    enabled: !!row.enabled,
    username: row.username || "",
    hasPassword: !!row.password_hash,
  };
}

// Stable per-install HMAC signing key for sessions. Generated + persisted once.
export function getSessionSecret() {
  const row = getAuthRow();
  if (row.session_secret) return row.session_secret;
  const secret = crypto.randomBytes(32).toString("hex");
  saveAuthRow({ session_secret: secret });
  return secret;
}

// Update config. Setting a password (re)hashes it. Refuses to enable without a
// password on file — the lockout guard.
export function setAuthConfig({ enabled, username, password }) {
  const patch = {};
  if (username != null) patch.username = String(username).trim();
  if (password) patch.password_hash = hashPassword(password);

  if (enabled != null) {
    const willHavePassword =
      patch.password_hash != null ? true : !!getAuthRow().password_hash;
    if (enabled && !willHavePassword) {
      throw new Error("Set a password before enabling login protection.");
    }
    patch.enabled = !!enabled;
  }

  // Ensure a session secret exists once auth is in play.
  if (patch.enabled) getSessionSecret();
  saveAuthRow(patch);
  return getAuthConfig();
}

export function verifyLogin(username, password) {
  const row = getAuthRow();
  if (!row.enabled || !row.password_hash) return false;
  const uOk = String(username || "").trim().toLowerCase() === String(row.username || "").toLowerCase();
  if (!uOk) return false;
  return passwordMatches(password, row.password_hash);
}
