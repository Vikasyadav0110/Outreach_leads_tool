import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// One shared connection for the whole process. In dev, Next reloads modules on
// edit, so we stash the instance on globalThis to avoid opening the file twice
// and to keep WAL mode stable across hot reloads.
const DB_PATH =
  process.env.OUTREACH_DB_PATH || path.join(process.cwd(), "data", "outreach.db");

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db) {
  // Detect first-ever creation of the snippets table so we can seed starters once.
  const hadSnippets = !!db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='snippets'`)
    .get();

  // Detect (BEFORE the CREATE TABLE below) whether the usage ledger already
  // exists, so the historical backfill runs exactly once on first creation.
  const hadUsageEvents = !!db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='usage_events'`)
    .get();

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at   TEXT NOT NULL,
      domain       TEXT NOT NULL,
      city         TEXT NOT NULL,
      niche        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'new',
      -- Full agent outputs, stored as JSON text. NULL until that agent runs.
      leads_json        TEXT,
      qualified_json    TEXT,
      messages_json     TEXT,
      error             TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      name            TEXT NOT NULL DEFAULT '',
      location        TEXT NOT NULL DEFAULT '',
      services        TEXT NOT NULL DEFAULT '',
      price_range     TEXT NOT NULL DEFAULT '',
      portfolio_line  TEXT NOT NULL DEFAULT ''
    );

    INSERT OR IGNORE INTO settings (id) VALUES (1);

    -- Per-lead pipeline status. Leads themselves live as JSON in the campaign
    -- row; this table tracks the outreach outcome for each, keyed by name.
    CREATE TABLE IF NOT EXISTS lead_outcomes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id  INTEGER NOT NULL,
      lead_name    TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'new',
      notes        TEXT NOT NULL DEFAULT '',
      updated_at   TEXT NOT NULL,
      UNIQUE (campaign_id, lead_name),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    -- Reusable message templates / snippets.
    CREATE TABLE IF NOT EXISTS snippets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL DEFAULT '',
      channel     TEXT NOT NULL DEFAULT 'general',
      body        TEXT NOT NULL DEFAULT '',
      uses        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );

    -- One row per data-sourcing run (a scrape of one source for one query).
    CREATE TABLE IF NOT EXISTS ingest_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  TEXT NOT NULL,
      source      TEXT NOT NULL,
      pipeline    TEXT NOT NULL,            -- 'deliver' | 'sell'
      query       TEXT NOT NULL,
      found       INTEGER NOT NULL DEFAULT 0,
      added       INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'running'  -- running | done | error
    );

    -- Single-row auth config. Kept OUT of the settings table on purpose so the
    -- password hash / session secret are never returned by /api/settings GET.
    CREATE TABLE IF NOT EXISTS auth (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      enabled        INTEGER NOT NULL DEFAULT 0,
      username       TEXT NOT NULL DEFAULT 'vytdl0110@gmail.com',
      password_hash  TEXT NOT NULL DEFAULT '',
      session_secret TEXT NOT NULL DEFAULT '',
      updated_at     TEXT
    );

    INSERT OR IGNORE INTO auth (id) VALUES (1);

    -- Normalized leads produced by source adapters, deduped across runs.
    -- pipeline keeps the two tasks (deliver vs sell) cleanly separated.
    CREATE TABLE IF NOT EXISTS sourced_leads (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      INTEGER,
      created_at  TEXT NOT NULL,
      source      TEXT NOT NULL,
      pipeline    TEXT NOT NULL,
      name        TEXT NOT NULL,
      website     TEXT,
      category    TEXT,
      city        TEXT,
      country     TEXT,
      contact     TEXT,
      title       TEXT,
      email       TEXT,
      phone       TEXT,
      signal      TEXT,                     -- WHY it's a lead
      score       INTEGER,
      raw_json    TEXT,
      dedup_key   TEXT UNIQUE
    );

    -- One row per LLM call (the usage ledger). Written centrally from
    -- recordUsage() in lib/anthropic.js, so EVERY call site is captured. The
    -- API Management screen aggregates this by provider / task.
    CREATE TABLE IF NOT EXISTS usage_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at    TEXT NOT NULL,
      task          TEXT NOT NULL DEFAULT 'other',
      provider      TEXT NOT NULL,
      model         TEXT NOT NULL,
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd      REAL NOT NULL DEFAULT 0,
      campaign_id   INTEGER,
      module        TEXT,
      mock          INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_usage_events_task     ON usage_events(task);
    CREATE INDEX IF NOT EXISTS idx_usage_events_provider ON usage_events(provider);
    CREATE INDEX IF NOT EXISTS idx_usage_events_created  ON usage_events(created_at);

    -- Follow-up tasks: the "chase" layer. One row per scheduled touch for a
    -- lead. Auto-created when a lead is marked 'contacted'; surfaced on the
    -- Dashboard "Today" list so no follow-up is forgotten.
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  TEXT NOT NULL,
      due_at      TEXT NOT NULL,
      campaign_id INTEGER NOT NULL,
      lead_name   TEXT NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'follow_up',  -- follow_up | call | custom
      note        TEXT NOT NULL DEFAULT '',
      done        INTEGER NOT NULL DEFAULT 0,
      done_at     TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_due  ON tasks(due_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks(done, due_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(campaign_id, lead_name);
  `);

  // Additive column for accumulated token usage/cost (older DBs won't have it).
  const cols = db.prepare(`PRAGMA table_info(campaigns)`).all().map((c) => c.name);
  if (!cols.includes("usage_json")) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN usage_json TEXT`);
  }
  // Additive: which business module a campaign belongs to (local | international).
  if (!cols.includes("module")) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN module TEXT NOT NULL DEFAULT 'local'`);
  }

  // Additive white-label columns on settings.
  const sCols = db.prepare(`PRAGMA table_info(settings)`).all().map((c) => c.name);
  if (!sCols.includes("brand_name")) {
    db.exec(`ALTER TABLE settings ADD COLUMN brand_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!sCols.includes("accent_key")) {
    db.exec(`ALTER TABLE settings ADD COLUMN accent_key TEXT NOT NULL DEFAULT 'blue'`);
  }
  // Active LLM provider: 'anthropic' (default) | 'gemini'.
  if (!sCols.includes("ai_provider")) {
    db.exec(`ALTER TABLE settings ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'anthropic'`);
  }
  // Per-task provider overrides (JSON map id->provider) for API Management.
  if (!sCols.includes("task_providers")) {
    db.exec(`ALTER TABLE settings ADD COLUMN task_providers TEXT NOT NULL DEFAULT '{}'`);
  }
  // Per-provider USD budgets (0 = no budget set).
  if (!sCols.includes("budget_anthropic_usd")) {
    db.exec(`ALTER TABLE settings ADD COLUMN budget_anthropic_usd REAL NOT NULL DEFAULT 0`);
  }
  if (!sCols.includes("budget_gemini_usd")) {
    db.exec(`ALTER TABLE settings ADD COLUMN budget_gemini_usd REAL NOT NULL DEFAULT 0`);
  }
  // When each per-provider budget was set ("anchored" to the real console
  // balance). Remaining counts only spend AFTER this timestamp, so the budget
  // can be the real remaining-credits value read from the provider's console.
  if (!sCols.includes("budget_anthropic_anchor")) {
    db.exec(`ALTER TABLE settings ADD COLUMN budget_anthropic_anchor TEXT NOT NULL DEFAULT ''`);
  }
  if (!sCols.includes("budget_gemini_anchor")) {
    db.exec(`ALTER TABLE settings ADD COLUMN budget_gemini_anchor TEXT NOT NULL DEFAULT ''`);
  }

  // Additive usage counter on snippets (older snippets tables won't have it).
  const snCols = db.prepare(`PRAGMA table_info(snippets)`).all().map((c) => c.name);
  if (!snCols.includes("uses")) {
    db.exec(`ALTER TABLE snippets ADD COLUMN uses INTEGER NOT NULL DEFAULT 0`);
  }

  // Performance indexes for the hot query paths (these columns are filtered on
  // nearly every page; without indexes SQLite full-table-scans). Idempotent.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_campaigns_module        ON campaigns(module);
    CREATE INDEX IF NOT EXISTS idx_lead_outcomes_campaign  ON lead_outcomes(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_sourced_leads_pipeline  ON sourced_leads(pipeline);
    CREATE INDEX IF NOT EXISTS idx_sourced_leads_run       ON sourced_leads(run_id);
  `);
  // NOTE on sourced_leads.run_id: SQLite can't add a FOREIGN KEY via ALTER TABLE
  // and a full table rebuild on existing data is riskier than its value for a
  // single-user app. The index above gives the lookup benefit; orphan cleanup is
  // handled in app logic (run deletes are rare).

  // Deal / commission fields on lead_outcomes (captured when a lead is won/lost).
  // The owner brokers projects to delivery partners, so we track value, partner,
  // commission %, expected close, and a win/loss reason for learning.
  const loCols = db.prepare(`PRAGMA table_info(lead_outcomes)`).all().map((c) => c.name);
  const loAdd = [
    ["deal_value", "REAL NOT NULL DEFAULT 0"],
    ["currency", "TEXT NOT NULL DEFAULT 'INR'"],
    ["partner", "TEXT NOT NULL DEFAULT ''"],
    ["commission_pct", "REAL NOT NULL DEFAULT 0"],
    ["expected_close", "TEXT NOT NULL DEFAULT ''"],
    ["reason", "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [col, def] of loAdd) {
    if (!loCols.includes(col)) db.exec(`ALTER TABLE lead_outcomes ADD COLUMN ${col} ${def}`);
  }

  // Seed starter templates only the first time the table is created (so a user
  // who deletes them all doesn't get them re-added on restart).
  if (!hadSnippets) seedSnippets(db);

  // One-time backfill: when the ledger is first created, seed it with each
  // existing campaign's rolled-up spend as a coarse 'historical' row, so the
  // API Management totals include past activity. (No per-task/model detail is
  // available for old data — that's expected.)
  if (!hadUsageEvents) backfillUsageEvents(db);

  // Record the schema version this build expects. The migration is additive +
  // idempotent (CREATE IF NOT EXISTS / guarded ALTER), so this is a marker for
  // diagnostics/future stepped migrations rather than a gate.
  db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`);
  db.prepare(
    `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(SCHEMA_VERSION));
}

// Bump when the schema changes. Additive/idempotent migrations mean we don't
// branch on it yet, but it gives a single source of truth + diagnostics.
const SCHEMA_VERSION = 3;

function backfillUsageEvents(db) {
  const rows = db
    .prepare(`SELECT id, module, usage_json FROM campaigns WHERE usage_json IS NOT NULL`)
    .all();
  const ins = db.prepare(
    `INSERT INTO usage_events
      (created_at, task, provider, model, input_tokens, output_tokens, cost_usd, campaign_id, module, mock)
     VALUES (?, 'historical', 'anthropic', 'historical', ?, ?, ?, ?, ?, 0)`
  );
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const r of rows) {
      let u;
      try {
        u = JSON.parse(r.usage_json);
      } catch {
        u = null;
      }
      if (!u) continue;
      const inTok = u.inputTokens || 0;
      const outTok = u.outputTokens || 0;
      const cost = u.costUsd || 0;
      if (!inTok && !outTok && !cost) continue;
      ins.run(now, inTok, outTok, cost, r.id, r.module || null);
    }
  });
  tx();
}

const STARTER_SNIPPETS = [
  ["First touch — WhatsApp", "whatsapp", "Hi 👋 — saw your business online and noticed there's no website capturing the people Googling you. I build simple lead-capture sites for local businesses. Open to a quick 15-min call this week?"],
  ["Gentle follow-up — Email", "email", "Hi,\n\nJust floating this back to the top of your inbox. Even a quick \"not now\" is helpful — but if getting more enquiries online is on your list, I'd love 15 minutes to show you how.\n\nBest,\n[Your name]"],
  ["No reply — WhatsApp nudge", "whatsapp", "Hi, following up on my last message 🙂 Should I send over a quick 2-min example of what I mean? No pressure either way."],
  ["Cold-call opener", "call", "Hi, am I speaking with the owner? This is [Your name] from [Your city]. Quick reason for my call — I noticed your business has great reviews but no website to send those customers to. Do you have 30 seconds?"],
  ["Soft close", "general", "Totally understand wanting to think it over. How about a small first step — one draft page you can review, no commitment? If you like it, we go from there."],
];

function seedSnippets(db) {
  const now = new Date().toISOString();
  const ins = db.prepare(
    `INSERT INTO snippets (title, channel, body, created_at) VALUES (?, ?, ?, ?)`
  );
  for (const [title, channel, body] of STARTER_SNIPPETS) ins.run(title, channel, body, now);
}

function getDb() {
  if (!globalThis.__outreachDb) {
    globalThis.__outreachDb = open();
  }
  return globalThis.__outreachDb;
}

// ---- Campaigns ----

export function createCampaign({ domain, city, niche, module = "local" }) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO campaigns (created_at, domain, city, niche, status, module)
     VALUES (?, ?, ?, ?, 'new', ?)`
  );
  const info = stmt.run(new Date().toISOString(), domain, city, niche, module);
  return getCampaign(info.lastInsertRowid);
}

// Create a campaign AND seed it with leads + pre-filled qualification cards in a
// single transaction, so a mid-failure can't leave a half-built campaign
// (leads but no cards, or a campaign stuck in the wrong status).
export function createSeededCampaign({ domain, city, niche, module = "local", leads, cards }) {
  const db = getDb();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO campaigns
           (created_at, domain, city, niche, status, module, leads_json, qualified_json)
         VALUES (?, ?, ?, ?, 'qualified', ?, ?, ?)`
      )
      .run(now, domain, city, niche, module, JSON.stringify(leads), JSON.stringify(cards));
    return info.lastInsertRowid;
  });
  return getCampaign(tx());
}

export function listCampaigns(module) {
  const db = getDb();
  const rows = module
    ? db.prepare(`SELECT * FROM campaigns WHERE module = ? ORDER BY id DESC`).all(module)
    : db.prepare(`SELECT * FROM campaigns ORDER BY id DESC`).all();

  // One grouped query for all campaigns' outcome counts, then attach per row:
  // { [campaignId]: { won: n, contacted: n, ... } }.
  const counts = {};
  for (const r of db
    .prepare(
      `SELECT campaign_id, status, COUNT(*) AS n
         FROM lead_outcomes GROUP BY campaign_id, status`
    )
    .all()) {
    (counts[r.campaign_id] ||= {})[r.status] = r.n;
  }

  return rows.map((row) => {
    const c = hydrate(row);
    c.outcomeCounts = counts[row.id] || {};
    return c;
  });
}

export function getCampaign(id) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id);
  if (!row) return null;
  const campaign = hydrate(row);
  campaign.outcomes = getOutcomes(id);
  return campaign;
}

// Persist one agent's output. `field` is one of the *_json columns; `value` is
// the parsed object/array (we serialize here so callers pass plain data).
export function saveAgentOutput(id, field, value) {
  const allowed = ["leads_json", "qualified_json", "messages_json"];
  if (!allowed.includes(field)) {
    throw new Error(`Unknown agent output field: ${field}`);
  }
  const db = getDb();
  db.prepare(`UPDATE campaigns SET ${field} = ? WHERE id = ?`).run(
    JSON.stringify(value),
    id
  );
  return getCampaign(id);
}

export function setStatus(id, status) {
  const db = getDb();
  db.prepare(`UPDATE campaigns SET status = ?, error = NULL WHERE id = ?`).run(
    status,
    id
  );
  return getCampaign(id);
}

export function setError(id, message) {
  const db = getDb();
  db.prepare(`UPDATE campaigns SET status = 'failed', error = ? WHERE id = ?`).run(message, id);
  return getCampaign(id);
}

// Flatten every lead across all campaigns, annotated with its campaign, outcome,
// and (for the detail drawer) its qualification card + written messages.
export function listAllLeads(module) {
  const db = getDb();
  const rows = module
    ? db.prepare(`SELECT * FROM campaigns WHERE module = ? ORDER BY id DESC`).all(module)
    : db.prepare(`SELECT * FROM campaigns ORDER BY id DESC`).all();

  // One query for all outcomes → map keyed by `${campaignId}::${leadName}`.
  const outcomeByKey = {};
  for (const o of db
    .prepare(
      `SELECT campaign_id, lead_name, status, notes, updated_at,
              deal_value, currency, partner, commission_pct, expected_close, reason
         FROM lead_outcomes`
    )
    .all()) {
    outcomeByKey[`${o.campaign_id}::${o.lead_name}`] = {
      status: o.status,
      notes: o.notes,
      updatedAt: o.updated_at,
      deal: {
        value: o.deal_value || 0,
        currency: o.currency || "INR",
        partner: o.partner || "",
        commissionPct: o.commission_pct || 0,
        expectedClose: o.expected_close || "",
        reason: o.reason || "",
      },
    };
  }

  const out = [];
  for (const row of rows) {
    const leads = parse(row.leads_json);
    if (!Array.isArray(leads)) continue;
    const cards = parse(row.qualified_json) || [];
    const messages = parse(row.messages_json) || [];
    const cardByName = {};
    cards.forEach((c) => c?.name && (cardByName[c.name.trim().toLowerCase()] = c));
    const msgByName = {};
    messages.forEach((m) => m?.name && (msgByName[m.name.trim().toLowerCase()] = m));

    for (const l of leads) {
      const o = outcomeByKey[`${row.id}::${l.name}`] || {};
      const nk = (l.name || "").trim().toLowerCase();
      out.push({
        campaignId: row.id,
        campaignLabel: `${row.niche} · ${row.city}`,
        campaignCreatedAt: row.created_at,
        niche: row.niche,
        domain: row.domain,
        name: l.name,
        category: l.category,
        website: l.website,
        score: l.score,
        priority: l.priority,
        gap: l.gap,
        source: l.source,
        status: o.status || "new",
        notes: o.notes || "",
        updatedAt: o.updatedAt || null,
        deal: o.deal || null,
        card: cardByName[nk] || null,
        message: msgByName[nk] || null,
      });
    }
  }
  return out;
}

// Delete a campaign and its lead outcomes (cascade via foreign key).
export function deleteCampaign(id) {
  const db = getDb();
  db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(id);
}

// ---- Sources / ingestion (scraping pipeline) ----

export function startIngestRun({ source, pipeline, query }) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO ingest_runs (created_at, source, pipeline, query) VALUES (?, ?, ?, ?)`
    )
    .run(new Date().toISOString(), source, pipeline, query || "");
  return { id: info.lastInsertRowid };
}

export function finishIngestRun(id, { found, added, status }) {
  const db = getDb();
  db.prepare(`UPDATE ingest_runs SET found = ?, added = ?, status = ? WHERE id = ?`).run(
    found || 0,
    added || 0,
    status || "done",
    id
  );
}

// Insert one normalized lead, deduped by (pipeline + website|name). Returns
// whether it was newly added plus the stored row (with id) for live streaming.
export function insertSourcedLead(lead) {
  const db = getDb();
  const dedupKey = `${lead.pipeline}:${(lead.website || lead.name || "")
    .trim()
    .toLowerCase()}`;
  const createdAt = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO sourced_leads
        (run_id, created_at, source, pipeline, name, website, category, city, country,
         contact, title, email, phone, signal, score, raw_json, dedup_key)
       VALUES (@run_id, @created_at, @source, @pipeline, @name, @website, @category, @city,
               @country, @contact, @title, @email, @phone, @signal, @score, @raw_json, @dedup_key)`
    )
    .run({
      run_id: lead.runId ?? null,
      created_at: createdAt,
      source: lead.source,
      pipeline: lead.pipeline,
      name: lead.name,
      website: lead.website || null,
      category: lead.category || null,
      city: lead.city || null,
      country: lead.country || null,
      contact: lead.contact || null,
      title: lead.title || null,
      email: lead.email || null,
      phone: lead.phone || null,
      signal: lead.signal || null,
      score: lead.score ?? null,
      raw_json: lead.raw ? JSON.stringify(lead.raw) : null,
      dedup_key: dedupKey,
    });
  const added = info.changes > 0;
  const row = added
    ? db.prepare(`SELECT * FROM sourced_leads WHERE id = ?`).get(info.lastInsertRowid)
    : db.prepare(`SELECT * FROM sourced_leads WHERE dedup_key = ?`).get(dedupKey);
  return { added, lead: sourcedRow(row) };
}

export function listSourcedLeads({ pipeline, limit = 200 } = {}) {
  const db = getDb();
  const rows = pipeline
    ? db
        .prepare(`SELECT * FROM sourced_leads WHERE pipeline = ? ORDER BY id DESC LIMIT ?`)
        .all(pipeline, limit)
    : db.prepare(`SELECT * FROM sourced_leads ORDER BY id DESC LIMIT ?`).all(limit);
  return rows.map(sourcedRow);
}

export function listIngestRuns(limit = 10) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, created_at AS createdAt, source, pipeline, query, found, added, status
         FROM ingest_runs ORDER BY id DESC LIMIT ?`
    )
    .all(limit);
}

export function sourcedStats() {
  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) AS n FROM sourced_leads`).get().n;
  const deliver = db
    .prepare(`SELECT COUNT(*) AS n FROM sourced_leads WHERE pipeline = 'deliver'`)
    .get().n;
  const sell = db
    .prepare(`SELECT COUNT(*) AS n FROM sourced_leads WHERE pipeline = 'sell'`)
    .get().n;
  return { total, deliver, sell };
}

function sourcedRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    runId: r.run_id,
    createdAt: r.created_at,
    source: r.source,
    pipeline: r.pipeline,
    name: r.name,
    website: r.website,
    category: r.category,
    city: r.city,
    country: r.country,
    contact: r.contact,
    title: r.title,
    email: r.email,
    phone: r.phone,
    signal: r.signal,
    score: r.score,
  };
}

// ---- Auth (single-row config; secrets handled by lib/authStore) ----

// Raw row including the hash + secret — callers (authStore only) must NOT
// forward password_hash / session_secret to any client response.
export function getAuthRow() {
  const db = getDb();
  return db.prepare(`SELECT * FROM auth WHERE id = 1`).get();
}

export function saveAuthRow(patch) {
  const db = getDb();
  const cur = getAuthRow();
  const next = {
    enabled: patch.enabled != null ? (patch.enabled ? 1 : 0) : cur.enabled,
    username: patch.username != null ? patch.username : cur.username,
    password_hash: patch.password_hash != null ? patch.password_hash : cur.password_hash,
    session_secret: patch.session_secret != null ? patch.session_secret : cur.session_secret,
  };
  db.prepare(
    `UPDATE auth SET enabled = ?, username = ?, password_hash = ?, session_secret = ?, updated_at = ?
       WHERE id = 1`
  ).run(
    next.enabled,
    next.username,
    next.password_hash,
    next.session_secret,
    new Date().toISOString()
  );
  return getAuthRow();
}

// ---- Snippets / templates ----

export function listSnippets() {
  const db = getDb();
  return db
    .prepare(`SELECT id, title, channel, body, uses, created_at AS createdAt FROM snippets ORDER BY id DESC`)
    .all();
}

export function createSnippet({ title, channel, body }) {
  const db = getDb();
  const info = db
    .prepare(`INSERT INTO snippets (title, channel, body, created_at) VALUES (?, ?, ?, ?)`)
    .run(title || "", channel || "general", body || "", new Date().toISOString());
  return db
    .prepare(`SELECT id, title, channel, body, uses, created_at AS createdAt FROM snippets WHERE id = ?`)
    .get(info.lastInsertRowid);
}

export function bumpSnippetUse(id) {
  const db = getDb();
  db.prepare(`UPDATE snippets SET uses = uses + 1 WHERE id = ?`).run(id);
}

export function deleteSnippet(id) {
  const db = getDb();
  db.prepare(`DELETE FROM snippets WHERE id = ?`).run(id);
}

// Accumulate token usage/cost onto a campaign (summed across agent runs).
export function addUsage(campaignId, usage) {
  if (!usage) return;
  const db = getDb();
  const row = db.prepare(`SELECT usage_json FROM campaigns WHERE id = ?`).get(campaignId);
  const cur = parse(row?.usage_json) || {};
  const merged = {
    inputTokens: (cur.inputTokens || 0) + (usage.inputTokens || 0),
    outputTokens: (cur.outputTokens || 0) + (usage.outputTokens || 0),
    costUsd: (cur.costUsd || 0) + (usage.costUsd || 0),
  };
  db.prepare(`UPDATE campaigns SET usage_json = ? WHERE id = ?`).run(
    JSON.stringify(merged),
    campaignId
  );
}

// ---- Usage ledger (API Management) ----

// Append one LLM call to the ledger. Called centrally from recordUsage() in
// lib/anthropic.js, so every call site is captured. Never throws to the caller
// (the gateway wraps this in try/catch) — but we keep it defensive anyway.
export function insertUsageEvent(ev) {
  const db = getDb();
  db.prepare(
    `INSERT INTO usage_events
      (created_at, task, provider, model, input_tokens, output_tokens, cost_usd, campaign_id, module, mock)
     VALUES (@created_at, @task, @provider, @model, @input_tokens, @output_tokens, @cost_usd, @campaign_id, @module, @mock)`
  ).run({
    created_at: new Date().toISOString(),
    task: ev.task || "other",
    provider: ev.provider || "anthropic",
    model: ev.model || "",
    input_tokens: ev.inputTokens || 0,
    output_tokens: ev.outputTokens || 0,
    cost_usd: ev.costUsd || 0,
    campaign_id: ev.campaignId ?? null,
    module: ev.module ?? null,
    mock: ev.mock ? 1 : 0,
  });
}

// Aggregate the ledger for the API Management screen. Excludes mock rows so the
// numbers reflect real spend only.
export function usageSummary() {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
              COALESCE(SUM(cost_usd), 0) AS usd
         FROM usage_events WHERE mock = 0`
    )
    .get();
  const byProvider = db
    .prepare(
      `SELECT provider,
              SUM(input_tokens + output_tokens) AS tokens,
              SUM(cost_usd) AS usd
         FROM usage_events WHERE mock = 0 GROUP BY provider`
    )
    .all();
  const byTask = db
    .prepare(
      `SELECT task, provider,
              SUM(input_tokens + output_tokens) AS tokens,
              SUM(cost_usd) AS usd
         FROM usage_events WHERE mock = 0 GROUP BY task, provider`
    )
    .all();
  return { totals, byProvider, byTask };
}

// Real-money spend for one provider AFTER an anchor timestamp (used for the
// budget "remaining" calc — see the anchor columns on settings). If `sinceIso`
// is falsy, counts ALL spend for that provider.
export function spentSince(provider, sinceIso) {
  const db = getDb();
  const row = sinceIso
    ? db
        .prepare(
          `SELECT COALESCE(SUM(cost_usd), 0) AS usd
             FROM usage_events WHERE mock = 0 AND provider = ? AND created_at >= ?`
        )
        .get(provider, sinceIso)
    : db
        .prepare(
          `SELECT COALESCE(SUM(cost_usd), 0) AS usd
             FROM usage_events WHERE mock = 0 AND provider = ?`
        )
        .get(provider);
  return row.usd || 0;
}

// ---- Lead outcomes (per-lead pipeline status) ----

// Returns an object keyed by lead name: { [name]: { status, notes, updatedAt } }.
export function getOutcomes(campaignId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT lead_name, status, notes, updated_at,
              deal_value, currency, partner, commission_pct, expected_close, reason
         FROM lead_outcomes WHERE campaign_id = ?`
    )
    .all(campaignId);
  const map = {};
  for (const r of rows) {
    map[r.lead_name] = {
      status: r.status,
      notes: r.notes,
      updatedAt: r.updated_at,
      deal: {
        value: r.deal_value || 0,
        currency: r.currency || "INR",
        partner: r.partner || "",
        commissionPct: r.commission_pct || 0,
        expectedClose: r.expected_close || "",
        reason: r.reason || "",
      },
    };
  }
  return map;
}

// Upsert one lead's outcome. `patch` may set status, notes, or both; whichever
// is omitted is preserved from the existing row. Status validity is enforced by
// the route, not here.
export function setOutcome(campaignId, patch) {
  const db = getDb();
  const existing = getOutcomes(campaignId)[patch.leadName] || {
    status: "new",
    notes: "",
    deal: {},
  };
  const status = patch.status != null ? patch.status : existing.status;
  const notes = patch.notes != null ? patch.notes : existing.notes;
  const updatedAt = new Date().toISOString();

  // Merge deal fields (only those provided in the patch; keep the rest).
  const d = patch.deal || {};
  const ex = existing.deal || {};
  const dealValue = d.value != null ? Number(d.value) || 0 : ex.value || 0;
  const currency = d.currency != null ? d.currency : ex.currency || "INR";
  const partner = d.partner != null ? d.partner : ex.partner || "";
  const commissionPct = d.commissionPct != null ? Number(d.commissionPct) || 0 : ex.commissionPct || 0;
  const expectedClose = d.expectedClose != null ? d.expectedClose : ex.expectedClose || "";
  const reason = d.reason != null ? d.reason : ex.reason || "";

  db.prepare(
    `INSERT INTO lead_outcomes
       (campaign_id, lead_name, status, notes, updated_at,
        deal_value, currency, partner, commission_pct, expected_close, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(campaign_id, lead_name)
     DO UPDATE SET status = excluded.status,
                   notes = excluded.notes,
                   updated_at = excluded.updated_at,
                   deal_value = excluded.deal_value,
                   currency = excluded.currency,
                   partner = excluded.partner,
                   commission_pct = excluded.commission_pct,
                   expected_close = excluded.expected_close,
                   reason = excluded.reason`
  ).run(
    campaignId, patch.leadName, status, notes, updatedAt,
    dealValue, currency, partner, commissionPct, expectedClose, reason
  );

  // Follow-up automation: when the status CHANGES, keep the chase queue in sync.
  // → 'contacted'  : schedule a follow-up (default +3 days) if none is open.
  // → 'replied'/'meeting'/'won'/'lost' : the touch landed, close open tasks.
  if (patch.status != null && patch.status !== existing.status) {
    if (patch.status === "contacted") {
      ensureFollowUpTask(campaignId, patch.leadName, 3);
    } else if (["replied", "meeting", "won", "lost"].includes(patch.status)) {
      completeTasksForLead(campaignId, patch.leadName);
    }
  }
  return { status, notes, updatedAt };
}

// ---- Follow-up tasks (the "chase" layer) ----

const DAY_MS = 86400000;

// Create a follow-up task due in `inDays`, unless this lead already has an open
// one (avoid duplicate nudges when a status is re-saved).
export function ensureFollowUpTask(campaignId, leadName, inDays = 3) {
  const db = getDb();
  const open = db
    .prepare(
      `SELECT id FROM tasks WHERE campaign_id = ? AND lead_name = ? AND done = 0 LIMIT 1`
    )
    .get(campaignId, leadName);
  if (open) return null;
  const now = new Date();
  const due = new Date(now.getTime() + inDays * DAY_MS).toISOString();
  const info = db
    .prepare(
      `INSERT INTO tasks (created_at, due_at, campaign_id, lead_name, kind, note)
       VALUES (?, ?, ?, ?, 'follow_up', '')`
    )
    .run(now.toISOString(), due, campaignId, leadName);
  return { id: info.lastInsertRowid };
}

export function createTask({ campaignId, leadName, dueAt, kind = "custom", note = "" }) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO tasks (created_at, due_at, campaign_id, lead_name, kind, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(new Date().toISOString(), dueAt, campaignId, leadName, kind, note);
  return { id: info.lastInsertRowid };
}

export function completeTask(id) {
  const db = getDb();
  db.prepare(`UPDATE tasks SET done = 1, done_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id
  );
}

export function snoozeTask(id, byDays = 1) {
  const db = getDb();
  const row = db.prepare(`SELECT due_at FROM tasks WHERE id = ?`).get(id);
  if (!row) return;
  const base = new Date(row.due_at);
  const next = new Date((isNaN(base) ? Date.now() : base.getTime()) + byDays * DAY_MS);
  db.prepare(`UPDATE tasks SET due_at = ? WHERE id = ?`).run(next.toISOString(), id);
}

function completeTasksForLead(campaignId, leadName) {
  const db = getDb();
  db.prepare(
    `UPDATE tasks SET done = 1, done_at = ? WHERE campaign_id = ? AND lead_name = ? AND done = 0`
  ).run(new Date().toISOString(), campaignId, leadName);
}

// Open tasks for the active module, enriched with campaign + lead context so the
// "Today" list can open the right lead drawer. Ordered by due date (overdue first).
export function listTasks({ module, onlyDue = false, limit = 100 } = {}) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.id, t.due_at, t.campaign_id, t.lead_name, t.kind, t.note, t.done,
              c.niche, c.city, c.domain, c.module
         FROM tasks t JOIN campaigns c ON c.id = t.campaign_id
        WHERE t.done = 0 ${module ? "AND c.module = ?" : ""}
        ORDER BY t.due_at ASC
        LIMIT ?`
    )
    .all(...(module ? [module, limit] : [limit]));
  const nowIso = new Date().toISOString();
  const out = rows.map((r) => ({
    id: r.id,
    dueAt: r.due_at,
    campaignId: r.campaign_id,
    leadName: r.lead_name,
    kind: r.kind,
    note: r.note,
    niche: r.niche,
    city: r.city,
    domain: r.domain,
    overdue: r.due_at <= nowIso,
  }));
  return onlyDue ? out.filter((t) => t.overdue) : out;
}

// Count of open tasks due now/overdue, for the sidebar badge.
export function dueTaskCount(module) {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(*) n FROM tasks t JOIN campaigns c ON c.id = t.campaign_id
        WHERE t.done = 0 AND t.due_at <= ? ${module ? "AND c.module = ?" : ""}`
    )
    .get(...(module ? [nowIso, module] : [nowIso]));
  return row.n || 0;
}

// Turn raw DB row into a friendly object with parsed JSON + derived counts.
function hydrate(row) {
  const leads = parse(row.leads_json);
  const qualified = parse(row.qualified_json);
  const messages = parse(row.messages_json);
  return {
    id: row.id,
    createdAt: row.created_at,
    domain: row.domain,
    city: row.city,
    niche: row.niche,
    module: row.module || "local",
    status: row.status,
    error: row.error || null,
    leads: leads || null,
    qualified: qualified || null,
    messages: messages || null,
    leadsFound: Array.isArray(leads) ? leads.length : 0,
    usage: parse(row.usage_json) || null,
  };
}

function parse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- Settings ----

export function getSettings() {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM settings WHERE id = 1`).get();
  return {
    name: row.name,
    location: row.location,
    services: row.services,
    priceRange: row.price_range,
    portfolioLine: row.portfolio_line,
    brandName: row.brand_name || "",
    accentKey: row.accent_key || "blue",
    aiProvider: row.ai_provider || "anthropic",
    taskProviders: parse(row.task_providers) || {},
    budgetAnthropicUsd: row.budget_anthropic_usd || 0,
    budgetGeminiUsd: row.budget_gemini_usd || 0,
    budgetAnthropicAnchor: row.budget_anthropic_anchor || "",
    budgetGeminiAnchor: row.budget_gemini_anchor || "",
  };
}

export function saveSettings(s) {
  const db = getDb();
  const cur = getSettings();
  db.prepare(
    `UPDATE settings
       SET name = ?, location = ?, services = ?, price_range = ?, portfolio_line = ?,
           brand_name = ?, accent_key = ?, ai_provider = ?,
           task_providers = ?, budget_anthropic_usd = ?, budget_gemini_usd = ?,
           budget_anthropic_anchor = ?, budget_gemini_anchor = ?
     WHERE id = 1`
  ).run(
    s.name ?? cur.name,
    s.location ?? cur.location,
    s.services ?? cur.services,
    s.priceRange ?? cur.priceRange,
    s.portfolioLine ?? cur.portfolioLine,
    s.brandName ?? cur.brandName,
    s.accentKey ?? cur.accentKey,
    s.aiProvider ?? cur.aiProvider,
    JSON.stringify(s.taskProviders ?? cur.taskProviders ?? {}),
    s.budgetAnthropicUsd ?? cur.budgetAnthropicUsd,
    s.budgetGeminiUsd ?? cur.budgetGeminiUsd,
    s.budgetAnthropicAnchor ?? cur.budgetAnthropicAnchor,
    s.budgetGeminiAnchor ?? cur.budgetGeminiAnchor
  );
  return getSettings();
}
