// Minimal end-to-end smoke test: logs in and checks the key routes return 200,
// plus a couple of data endpoints. Run with the dev server up:
//   node scripts/smoke.mjs
// Env overrides: SMOKE_BASE, SMOKE_USER, SMOKE_PASS.

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const USER = process.env.SMOKE_USER || "vytdl0110@gmail.com";
const PASS = process.env.SMOKE_PASS || "Password@0110";

const F = (u, o = {}) => fetch(u, { ...o, signal: AbortSignal.timeout(30000) });

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
  ok ? pass++ : fail++;
}

const PAGES = ["/", "/leads", "/campaigns", "/sources", "/analytics", "/settings"];
const APIS = ["/api/campaigns", "/api/tasks", "/api/usage"];

async function main() {
  // Auth
  const login = await F(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  check("login → 200", login.status === 200, `status ${login.status}`);
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) {
    console.log("\nNo session cookie — aborting.");
    process.exit(1);
  }

  for (const mod of ["local", "international"]) {
    const H = { Cookie: `${cookie}; op_module=${mod}` };
    for (const p of PAGES) {
      const r = await F(`${BASE}${p}`, { headers: H });
      const html = await r.text();
      check(`[${mod}] ${p}`, r.ok && !html.includes("Application error"), `status ${r.status}`);
    }
    for (const p of APIS) {
      const r = await F(`${BASE}${p}`, { headers: H });
      check(`[${mod}] ${p}`, r.ok, `status ${r.status}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("smoke test error:", e.message);
  process.exit(1);
});
