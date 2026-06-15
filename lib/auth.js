// Edge-safe session helpers (Web Crypto only — no node imports — so verifySession
// works in both the edge middleware and node route handlers). The signing secret
// is passed in by the caller (from lib/authStore, which reads the per-install
// random secret from the DB). We do NOT fall back to a hardcoded default: a known
// secret would let anyone forge a session. An optional AUTH_SECRET env var may
// override; otherwise a missing secret makes sign/verify fail closed.

export const SESSION_COOKIE = "op_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Resolve the effective secret, or null if none is configured. Caller-supplied
// (DB) secret wins; AUTH_SECRET env is an explicit override. Never a default.
function resolveSecret(secretStr) {
  return secretStr || process.env.AUTH_SECRET || null;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = str.length % 4 ? 4 - (str.length % 4) : 0;
  str += "=".repeat(pad);
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
async function sign(data, secret) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data));
  return b64url(new Uint8Array(sig));
}

// token = base64url(payload) "." base64url(HMAC(payload))
export async function createSession(secretStr, maxAgeSec = SESSION_MAX_AGE) {
  const secret = resolveSecret(secretStr);
  if (!secret) throw new Error("No session secret configured — cannot create a session.");
  const data = b64url(enc.encode(JSON.stringify({ exp: Date.now() + maxAgeSec * 1000 })));
  return `${data}.${await sign(data, secret)}`;
}

export async function verifySession(token, secretStr) {
  const secret = resolveSecret(secretStr);
  // Fail closed: no secret → no valid session (never accept a guessable default).
  if (!secret) return false;
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [data, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(data));
    if (!ok) return false;
    const payload = JSON.parse(dec.decode(fromB64url(data)));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}
