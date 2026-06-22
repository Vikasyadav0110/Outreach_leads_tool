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
  // Same for sequences (starter cadences seeded once on first creation).
  const hadSequences = !!db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='sequences'`)
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

    -- Reusable multi-step follow-up cadences. steps_json = ordered
    -- [{channel:'email'|'whatsapp'|'call', dayOffset:Number, label:String}].
    CREATE TABLE IF NOT EXISTS sequences (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      module      TEXT NOT NULL DEFAULT 'local',
      name        TEXT NOT NULL DEFAULT '',
      steps_json  TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL
    );

    -- Append-only per-lead activity log (provenance + history timeline).
    -- kind: found | qualified | contact_found | status | engagement | note | suppressed | unsuppressed
    CREATE TABLE IF NOT EXISTS lead_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id     INTEGER NOT NULL,
      created_at  TEXT NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'note',
      detail      TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id);

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
  // In-app API keys (optional; env vars take precedence). Stored in the local
  // SQLite DB — appropriate for a single-user, local-first app. Never returned
  // by GET /api/settings (write-only from the UI).
  if (!sCols.includes("anthropic_key")) {
    db.exec(`ALTER TABLE settings ADD COLUMN anthropic_key TEXT NOT NULL DEFAULT ''`);
  }
  if (!sCols.includes("gemini_key")) {
    db.exec(`ALTER TABLE settings ADD COLUMN gemini_key TEXT NOT NULL DEFAULT ''`);
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

  // Named saved searches/filters (Sources + Leads) — survive across devices so
  // the user stops re-typing the same searches. scope keeps the two uses apart.
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at   TEXT NOT NULL,
      module       TEXT NOT NULL,
      scope        TEXT NOT NULL,        -- 'source' | 'leads'
      name         TEXT NOT NULL,
      params_json  TEXT NOT NULL,
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_saved_searches_scope ON saved_searches(module, scope);
  `);

  // Store the FULL param bag of each sourcing run so a run can be re-run with
  // one click (the human-readable `query` column stays as the summary).
  const irCols = db.prepare(`PRAGMA table_info(ingest_runs)`).all().map((c) => c.name);
  if (!irCols.includes("params_json")) {
    db.exec(`ALTER TABLE ingest_runs ADD COLUMN params_json TEXT`);
  }
  // Persist the failure message for error runs (Sources health panel).
  if (!irCols.includes("error")) {
    db.exec(`ALTER TABLE ingest_runs ADD COLUMN error TEXT`);
  }

  // ---- Normalized lead model (Data ↔ Campaigns, many-to-many) ----
  // These tables are created empty and stay empty until the one-time migration
  // (scripts/migrate-normalize.cjs --commit) backfills them. The old campaigns
  // JSON columns remain the source of truth until that migration runs, so the
  // existing UI keeps working unchanged.
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      module TEXT NOT NULL DEFAULT 'local',
      business_name TEXT NOT NULL,
      city TEXT, niche TEXT, domain TEXT, source TEXT, website TEXT,
      score INTEGER, priority TEXT, gap TEXT,
      qualification_notes TEXT, decision_maker TEXT, email TEXT, phone TEXT,
      whatsapp TEXT, title TEXT, linkedin TEXT, personalization_hook TEXT,
      service_tag TEXT, contact_source TEXT,
      qualified INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new', status_updated_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      deal_value REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'INR',
      partner TEXT NOT NULL DEFAULT '', commission_pct REAL NOT NULL DEFAULT 0,
      expected_close TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
      identity_key TEXT UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_leads_module ON leads(module);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

    CREATE TABLE IF NOT EXISTS campaigns_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      module TEXT NOT NULL DEFAULT 'local',
      name TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT 'multi',
      status TEXT NOT NULL DEFAULT 'draft',
      domain TEXT, city TEXT, niche TEXT, usage_json TEXT, error TEXT, legacy_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_campaigns_v2_module ON campaigns_v2(module);

    CREATE TABLE IF NOT EXISTS campaign_leads (
      campaign_id INTEGER NOT NULL,
      lead_id INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      email_subject TEXT, email_message TEXT, whatsapp_message TEXT,
      call_script TEXT, meeting_kit TEXT,
      engagement TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (campaign_id, lead_id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns_v2(id) ON DELETE CASCADE,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead ON campaign_leads(lead_id);
  `);
  // Re-key the chase layer to lead_id (additive; tasks currently keyed by name).
  const tCols = db.prepare(`PRAGMA table_info(tasks)`).all().map((c) => c.name);
  if (!tCols.includes("lead_id")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN lead_id INTEGER`);
  }
  // When a lead in a campaign was last touched (set on each engagement change) —
  // powers "X days since touch" / staleness sorting later.
  const clCols = db.prepare(`PRAGMA table_info(campaign_leads)`).all().map((c) => c.name);
  if (!clCols.includes("last_touch_at")) {
    db.exec(`ALTER TABLE campaign_leads ADD COLUMN last_touch_at TEXT`);
  }
  // Per-lead / per-source cost attribution on the spend ledger (Reports). New
  // rows are tagged at insert time via recordUsage(); historical rows stay
  // task/campaign-level (no destructive backfill).
  const ueCols = db.prepare(`PRAGMA table_info(usage_events)`).all().map((c) => c.name);
  if (!ueCols.includes("lead_id")) db.exec(`ALTER TABLE usage_events ADD COLUMN lead_id INTEGER`);
  if (!ueCols.includes("source")) db.exec(`ALTER TABLE usage_events ADD COLUMN source TEXT`);
  // Sequences: which cadence a campaign runs, and which step a follow-up task is.
  const cvCols = db.prepare(`PRAGMA table_info(campaigns_v2)`).all().map((c) => c.name);
  if (!cvCols.includes("sequence_id")) db.exec(`ALTER TABLE campaigns_v2 ADD COLUMN sequence_id INTEGER`);
  const taskCols = db.prepare(`PRAGMA table_info(tasks)`).all().map((c) => c.name);
  if (!taskCols.includes("step_index")) db.exec(`ALTER TABLE tasks ADD COLUMN step_index INTEGER`);
  // Suppression / do-not-contact flag on leads (enforced in enrich + qualify).
  const leadCols = db.prepare(`PRAGMA table_info(leads)`).all().map((c) => c.name);
  if (!leadCols.includes("suppressed")) db.exec(`ALTER TABLE leads ADD COLUMN suppressed INTEGER NOT NULL DEFAULT 0`);
  if (!leadCols.includes("suppressed_reason")) db.exec(`ALTER TABLE leads ADD COLUMN suppressed_reason TEXT`);
  // Seed-once: give existing leads a minimal timeline ('found' + 'qualified').
  const leadEventsSeeded = db.prepare(`SELECT value FROM schema_meta WHERE key='lead_events_seeded'`).get()?.value === "1";
  if (!leadEventsSeeded) {
    const ins = db.prepare(`INSERT INTO lead_events (lead_id, created_at, kind, detail) VALUES (?,?,?,?)`);
    for (const l of db.prepare(`SELECT id, created_at, source, qualified, status_updated_at FROM leads`).all()) {
      ins.run(l.id, l.created_at || new Date().toISOString(), "found", l.source ? `Sourced via ${l.source}` : "Lead created");
      if (l.qualified) ins.run(l.id, l.status_updated_at || l.created_at || new Date().toISOString(), "qualified", "Qualified & scored");
    }
    db.prepare(`INSERT INTO schema_meta (key,value) VALUES ('lead_events_seeded','1') ON CONFLICT(key) DO UPDATE SET value='1'`).run();
  }
  // The chase layer is now keyed by lead_id (campaigns_v2 ids don't exist in the
  // old `campaigns` table, so the original tasks.campaign_id→campaigns FK would
  // fail). Rebuild `tasks` once to drop that stale FK (campaign_id stays as a
  // plain column). Guarded by a schema_meta flag so it runs only once.
  const tasksRekeyed = db.prepare(`SELECT value FROM schema_meta WHERE key='tasks_rekeyed'`).get()?.value === "1";
  const tasksHasFk = db.prepare(`PRAGMA foreign_key_list(tasks)`).all().length > 0;
  if (!tasksRekeyed && tasksHasFk) {
    db.exec(`
      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL, due_at TEXT NOT NULL,
        campaign_id INTEGER, lead_name TEXT NOT NULL DEFAULT '', lead_id INTEGER,
        kind TEXT NOT NULL DEFAULT 'follow_up', note TEXT NOT NULL DEFAULT '',
        done INTEGER NOT NULL DEFAULT 0, done_at TEXT
      );
      INSERT INTO tasks_new (id, created_at, due_at, campaign_id, lead_name, lead_id, kind, note, done, done_at)
        SELECT id, created_at, due_at, campaign_id, lead_name, lead_id, kind, note, done, done_at FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_due  ON tasks(due_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks(done, due_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);
    `);
    db.prepare(`INSERT INTO schema_meta (key,value) VALUES ('tasks_rekeyed','1') ON CONFLICT(key) DO UPDATE SET value='1'`).run();
  }

  // Seed starter templates only the first time the table is created (so a user
  // who deletes them all doesn't get them re-added on restart).
  if (!hadSnippets) seedSnippets(db);
  if (!hadSequences) seedSequences(db);

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
const SCHEMA_VERSION = 5;

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

// Starter cadences — a classic 4-touch and a lean 2-touch. dayOffset is days
// after the prior step (the first step fires when the lead is contacted).
const STARTER_SEQUENCES = [
  {
    name: "Classic 4-touch",
    steps: [
      { channel: "email", dayOffset: 0, label: "Intro email" },
      { channel: "whatsapp", dayOffset: 3, label: "Bump #1" },
      { channel: "call", dayOffset: 4, label: "Call check-in" },
      { channel: "email", dayOffset: 5, label: "Break-up email" },
    ],
  },
  {
    name: "Quick 2-touch",
    steps: [
      { channel: "email", dayOffset: 0, label: "Intro email" },
      { channel: "whatsapp", dayOffset: 3, label: "Follow-up" },
    ],
  },
];

function seedSequences(db) {
  const now = new Date().toISOString();
  const ins = db.prepare(
    `INSERT INTO sequences (module, name, steps_json, created_at) VALUES (?, ?, ?, ?)`
  );
  for (const mod of ["local", "international"]) {
    for (const s of STARTER_SEQUENCES) ins.run(mod, s.name, JSON.stringify(s.steps), now);
  }
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

// Patch a single qualification card's editable fields (manual fix of a wrong
// phone/email/decision-maker). Matches by lead name (case-insensitive), the
// same key used everywhere else. Returns the updated card or null if not found.
export function patchQualifiedCard(campaignId, cardName, patch) {
  const db = getDb();
  const row = db.prepare(`SELECT qualified_json FROM campaigns WHERE id = ?`).get(campaignId);
  const cards = parse(row?.qualified_json);
  if (!Array.isArray(cards)) return null;
  const nk = (cardName || "").trim().toLowerCase();
  const idx = cards.findIndex((c) => (c.name || "").trim().toLowerCase() === nk);
  if (idx < 0) return null;
  const allowed = ["decisionMaker", "whatsapp", "email"];
  for (const f of allowed) {
    if (patch[f] != null) cards[idx][f] = String(patch[f]).trim();
  }
  db.prepare(`UPDATE campaigns SET qualified_json = ? WHERE id = ?`).run(JSON.stringify(cards), campaignId);
  return cards[idx];
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

export function startIngestRun({ source, pipeline, query, params }) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO ingest_runs (created_at, source, pipeline, query, params_json) VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      new Date().toISOString(),
      source,
      pipeline,
      query || "",
      params ? JSON.stringify(params) : null
    );
  return { id: info.lastInsertRowid };
}

// ---- Saved searches (Sources + Leads) ----

export function createSavedSearch({ module, scope, name, params }) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO saved_searches (created_at, module, scope, name, params_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(new Date().toISOString(), module, scope, name, JSON.stringify(params || {}));
  return { id: info.lastInsertRowid };
}

export function listSavedSearches({ module, scope }) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, params_json, created_at, last_used_at
         FROM saved_searches WHERE module = ? AND scope = ?
        ORDER BY (last_used_at IS NULL), last_used_at DESC, id DESC`
    )
    .all(module, scope)
    .map((r) => ({
      id: r.id,
      name: r.name,
      params: parse(r.params_json) || {},
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    }));
}

export function deleteSavedSearch(id) {
  getDb().prepare(`DELETE FROM saved_searches WHERE id = ?`).run(id);
}

export function touchSavedSearch(id) {
  getDb()
    .prepare(`UPDATE saved_searches SET last_used_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id);
}

export function finishIngestRun(id, { found, added, status, error }) {
  const db = getDb();
  db.prepare(`UPDATE ingest_runs SET found = ?, added = ?, status = ?, error = ? WHERE id = ?`).run(
    found || 0,
    added || 0,
    status || "done",
    error ? String(error).slice(0, 300) : null,
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
      `SELECT id, created_at AS createdAt, source, pipeline, query, found, added, status, error, params_json
         FROM ingest_runs ORDER BY id DESC LIMIT ?`
    )
    .all(limit)
    .map((r) => ({ ...r, params: parse(r.params_json) || null }));
}

// Mark runs stuck in 'running' (server died mid-run) as interrupted, so health
// isn't pinned to a phantom in-flight run. Cheap; called from sourceHealth.
function reconcileStaleRuns(maxMinutes = 15) {
  const db = getDb();
  const cutoff = new Date(Date.now() - maxMinutes * 60000).toISOString();
  db.prepare(`UPDATE ingest_runs SET status='error', error=COALESCE(error,'Interrupted (no completion recorded)')
              WHERE status='running' AND created_at < ?`).run(cutoff);
}

// Per-source health for the active pipeline: one row per connector (incl. those
// that have NEVER run), with yield + last status/error. `adapters` is the list of
// known source keys so never-run connectors still appear.
export function sourceHealth(pipeline, adapters = []) {
  const db = getDb();
  reconcileStaleRuns();
  const rows = db
    .prepare(
      `SELECT source,
              COUNT(*) AS runs,
              MAX(created_at) AS lastRunAt,
              SUM(found) AS totalFound,
              SUM(added) AS totalAdded,
              SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errorRuns
         FROM ingest_runs WHERE pipeline = ? GROUP BY source`
    )
    .all(pipeline);
  const bySource = new Map(rows.map((r) => [r.source, r]));
  // last status + last error per source (most recent run)
  const lastBy = {};
  for (const r of db
    .prepare(`SELECT source, status, error, created_at FROM ingest_runs WHERE pipeline = ? ORDER BY id DESC`)
    .all(pipeline)) {
    if (!lastBy[r.source]) lastBy[r.source] = { status: r.status, error: r.error, at: r.created_at };
  }
  // Union of connectors that have run + known adapters (so 'never' ones show).
  const names = new Set([...bySource.keys(), ...adapters]);
  return [...names]
    .map((source) => {
      const agg = bySource.get(source);
      const last = lastBy[source];
      const runs = agg?.runs || 0;
      return {
        source,
        runs,
        lastRunAt: agg?.lastRunAt || null,
        lastStatus: runs ? (last?.status || "done") : "never",
        totalFound: agg?.totalFound || 0,
        totalAdded: agg?.totalAdded || 0,
        avgAdded: runs ? Math.round(((agg?.totalAdded || 0) / runs) * 10) / 10 : 0,
        errorRuns: agg?.errorRuns || 0,
        lastError: last?.status === "error" ? last?.error || "Failed" : null,
      };
    })
    .sort((a, b) => (b.runs - a.runs) || a.source.localeCompare(b.source));
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

// ============================================================================
// Normalized lead model — leads (data) ↔ campaign_leads (m2m) ↔ campaigns_v2.
// These power the new /leads + /campaigns UI. Active once the migration commits.
// ============================================================================

const idKey = (mod, name, city) =>
  `${mod || "local"}|${(name || "").trim().toLowerCase()}|${(city || "").trim().toLowerCase()}`;

function leadRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    createdAt: r.created_at,
    module: r.module,
    name: r.business_name, // alias so existing lead components (lead.name) work
    businessName: r.business_name,
    city: r.city,
    niche: r.niche,
    domain: r.domain,
    source: r.source,
    website: r.website,
    score: r.score,
    priority: r.priority,
    gap: r.gap,
    qualified: !!r.qualified,
    status: r.status,
    notes: r.notes || "",
    suppressed: !!r.suppressed,
    suppressedReason: r.suppressed_reason || "",
    // Qualification "card" projection so LeadDrawer/MessageTabs reuse works.
    card: r.qualified
      ? {
          name: r.business_name,
          exactGap: r.qualification_notes,
          decisionMaker: r.decision_maker,
          whatsapp: r.phone || r.whatsapp,
          email: r.email,
          title: r.title,
          linkedin: r.linkedin,
          personalizationHook: r.personalization_hook,
          serviceTag: r.service_tag,
          contactSource: r.contact_source,
        }
      : null,
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

// Upsert a lead by identity (module|name|city). First insert wins; later calls
// fill EMPTY fields only (never overwrite a verified value). Returns
// { id, created } so callers can report added vs updated.
export function upsertLeadByIdentity(lead) {
  const db = getDb();
  const mod = lead.module || "local";
  const key = idKey(mod, lead.name || lead.businessName, lead.city);
  const existing = db.prepare(`SELECT * FROM leads WHERE identity_key = ?`).get(key);
  const card = lead.card || {};
  if (existing) {
    db.prepare(
      `UPDATE leads SET
         website = COALESCE(NULLIF(website,''), @website),
         score = COALESCE(score, @score),
         gap = COALESCE(NULLIF(gap,''), @gap),
         qualification_notes = COALESCE(NULLIF(qualification_notes,''), @qualification_notes),
         decision_maker = COALESCE(NULLIF(decision_maker,''), @decision_maker),
         email = COALESCE(NULLIF(email,''), @email),
         phone = COALESCE(NULLIF(phone,''), @phone),
         linkedin = COALESCE(NULLIF(linkedin,''), @linkedin),
         service_tag = COALESCE(NULLIF(service_tag,''), @service_tag),
         qualified = MAX(qualified, @qualified)
       WHERE id = @id`
    ).run({
      id: existing.id,
      website: lead.website || "",
      score: lead.score ?? null,
      gap: lead.gap || "",
      qualification_notes: card.exactGap || "",
      decision_maker: card.decisionMaker || "",
      email: card.email || "",
      phone: card.whatsapp || lead.phone || "",
      linkedin: card.linkedin || "",
      service_tag: card.serviceTag || "",
      qualified: card && Object.keys(card).length ? 1 : 0,
    });
    return { id: existing.id, created: false };
  }
  const info = db
    .prepare(
      `INSERT INTO leads
        (created_at, module, business_name, city, niche, domain, source, website, score, priority, gap,
         qualification_notes, decision_maker, email, phone, whatsapp, title, linkedin, personalization_hook,
         service_tag, contact_source, qualified, status, status_updated_at, identity_key)
       VALUES (@created_at,@module,@business_name,@city,@niche,@domain,@source,@website,@score,@priority,@gap,
         @qualification_notes,@decision_maker,@email,@phone,@whatsapp,@title,@linkedin,@personalization_hook,
         @service_tag,@contact_source,@qualified,@status,@status_updated_at,@identity_key)`
    )
    .run({
      created_at: new Date().toISOString(),
      module: mod,
      business_name: lead.name || lead.businessName,
      city: lead.city || "",
      niche: lead.niche || "",
      domain: lead.domain || "",
      source: lead.source || "",
      website: lead.website || "",
      score: lead.score ?? null,
      priority: lead.priority || "",
      gap: lead.gap || "",
      qualification_notes: card.exactGap || "",
      decision_maker: card.decisionMaker || "",
      email: card.email || "",
      phone: card.whatsapp || lead.phone || "",
      whatsapp: card.whatsapp || lead.phone || "",
      title: card.title || lead.title || "",
      linkedin: card.linkedin || "",
      personalization_hook: card.personalizationHook || "",
      service_tag: card.serviceTag || "",
      contact_source: card.contactSource || "",
      qualified: card && Object.keys(card).length ? 1 : 0,
      status: card && Object.keys(card).length ? "qualified" : "new",
      status_updated_at: new Date().toISOString(),
      identity_key: key,
    });
  logLeadEvent(info.lastInsertRowid, "found", lead.source ? `Sourced via ${lead.source}` : "Lead created");
  return { id: info.lastInsertRowid, created: true };
}

export function getLead(id) {
  return leadRow(getDb().prepare(`SELECT * FROM leads WHERE id = ?`).get(id));
}

// Rows shaped for lib/analytics.js (normalized model). Each lead once, with the
// fields the analytics functions read: status (lifecycle), score, niche, source,
// deal, name, createdAt/updatedAt for time-to-close.
export function leadsForAnalytics(module) {
  const db = getDb();
  const rows = module
    ? db.prepare(`SELECT * FROM leads WHERE module = ? ORDER BY id DESC`).all(module)
    : db.prepare(`SELECT * FROM leads ORDER BY id DESC`).all();
  return rows.map((r) => ({
    name: r.business_name,
    niche: r.niche,
    source: r.source,
    score: r.score,
    status: r.status,
    qualified: !!r.qualified,
    campaignCreatedAt: r.created_at,
    updatedAt: r.status_updated_at || r.created_at,
    deal: {
      value: r.deal_value || 0, currency: r.currency || "INR", partner: r.partner || "",
      commissionPct: r.commission_pct || 0, expectedClose: r.expected_close || "", reason: r.reason || "",
    },
  }));
}

// Campaign-level rollups for analytics (counts from campaign_leads + leads).
export function campaignsForAnalytics(module) {
  const db = getDb();
  const camps = module
    ? db.prepare(`SELECT * FROM campaigns_v2 WHERE module = ? ORDER BY id DESC`).all(module)
    : db.prepare(`SELECT * FROM campaigns_v2 ORDER BY id DESC`).all();
  return camps.map((c) => {
    const links = db
      .prepare(`SELECT cl.engagement, cl.email_message, l.qualified
                  FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id WHERE cl.campaign_id = ?`)
      .all(c.id);
    const outcomeCounts = {};
    let messaged = 0, qualified = 0;
    for (const l of links) {
      if (l.email_message) messaged++;
      if (l.qualified) qualified++;
      if (l.engagement) outcomeCounts[l.engagement] = (outcomeCounts[l.engagement] || 0) + 1;
    }
    return {
      id: c.id, createdAt: c.created_at, domain: c.domain || "local", niche: c.niche,
      leadsFound: links.length,
      qualified: Array(qualified), // length-only consumers (arrLen)
      messages: Array(messaged),
      outcomeCounts,
      usage: c.usage_json ? JSON.parse(c.usage_json) : null,
    };
  });
}

// List leads for a module, each annotated with how many campaigns it's in.
export function listLeads(module) {
  const db = getDb();
  const rows = module
    ? db.prepare(`SELECT * FROM leads WHERE module = ? ORDER BY id DESC`).all(module)
    : db.prepare(`SELECT * FROM leads ORDER BY id DESC`).all();
  const counts = {};
  for (const r of db.prepare(`SELECT lead_id, COUNT(*) n FROM campaign_leads GROUP BY lead_id`).all()) {
    counts[r.lead_id] = r.n;
  }
  return rows.map((r) => ({ ...leadRow(r), campaignCount: counts[r.id] || 0 }));
}

// ---- "Today" workspace queues -------------------------------------------

// Leads that replied (manual engagement='replied') but have no OPEN follow-up
// task — i.e. the reply landed and nothing is scheduled next. These are the
// hottest, most time-sensitive items. One row per (lead, campaign) so each card
// can deep-link to the right campaign. Ordered most-recently-touched first.
export function listRepliesToAction(module) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT l.*, cl.campaign_id AS reply_campaign_id, cl.last_touch_at AS reply_last_touch
         FROM campaign_leads cl
         JOIN leads l ON l.id = cl.lead_id
        WHERE cl.engagement = 'replied'
          ${module ? "AND l.module = ?" : ""}
          AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id = l.id AND t.done = 0)
        ORDER BY cl.last_touch_at DESC NULLS LAST, l.id DESC`
    )
    .all(...(module ? [module] : []));
  return rows.map((r) => ({
    ...leadRow(r),
    campaignId: r.reply_campaign_id,
    lastTouchAt: r.reply_last_touch || null,
  }));
}

// Qualified leads not yet in any campaign, best-scored first — the ready-to-work
// pile a manager wants to load into a campaign.
export function listHotLeads(module, limit = 8) {
  return listLeads(module)
    .filter((l) => l.status === "qualified" && (l.campaignCount || 0) === 0)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
}

// Patch editable lead fields (inline contact edit + manual status/deal).
export function patchLead(id, patch) {
  const db = getDb();
  const sets = [];
  const args = { id };
  const map = {
    decisionMaker: "decision_maker", email: "email", whatsapp: "phone",
    status: "status", notes: "notes",
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] != null) { sets.push(`${col} = @${col}`); args[col] = String(patch[k]).trim(); }
  }
  if (patch.status != null) { sets.push(`status_updated_at = @sat`); args.sat = new Date().toISOString(); }
  if (patch.deal) {
    const d = patch.deal;
    const dmap = { value: "deal_value", currency: "currency", partner: "partner", commissionPct: "commission_pct", expectedClose: "expected_close", reason: "reason" };
    for (const [k, col] of Object.entries(dmap)) {
      if (d[k] != null) { sets.push(`${col} = @${col}`); args[col] = typeof d[k] === "number" ? d[k] : String(d[k]).trim(); }
    }
  }
  // Capture the prior status so we can log an accurate transition.
  const prevStatus = patch.status != null ? db.prepare(`SELECT status FROM leads WHERE id = ?`).get(id)?.status : null;
  if (sets.length) db.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = @id`).run(args);
  if (patch.status != null && patch.status !== prevStatus) {
    logLeadEvent(id, "status", `Status → ${patch.status}`);
  }
  return getLead(id);
}

export function setLeadQualified(id, card) {
  const db = getDb();
  const wasQualified = !!db.prepare(`SELECT qualified FROM leads WHERE id = ?`).get(id)?.qualified;
  db.prepare(
    `UPDATE leads SET qualified = 1, status = CASE WHEN status = 'new' THEN 'qualified' ELSE status END,
       qualification_notes = COALESCE(NULLIF(@qn,''), qualification_notes),
       decision_maker = COALESCE(NULLIF(@dm,''), decision_maker),
       email = COALESCE(NULLIF(@email,''), email),
       phone = COALESCE(NULLIF(@phone,''), phone),
       linkedin = COALESCE(NULLIF(@linkedin,''), linkedin),
       personalization_hook = COALESCE(NULLIF(@hook,''), personalization_hook),
       service_tag = COALESCE(NULLIF(@svc,''), service_tag),
       contact_source = COALESCE(NULLIF(@src,''), contact_source)
     WHERE id = @id`
  ).run({
    id, qn: card.exactGap || "", dm: card.decisionMaker || "", email: card.email || "",
    phone: card.whatsapp || "", linkedin: card.linkedin || "", hook: card.personalizationHook || "",
    svc: card.serviceTag || "", src: card.contactSource || "",
  });
  // Log: a contact-found enrich vs. an initial qualify (was-already-qualified check
  // avoids spamming 'qualified' on every re-enrich).
  if (card.contactSource) logLeadEvent(id, "contact_found", `Contact found via ${card.contactSource}`);
  else if (!wasQualified) logLeadEvent(id, "qualified", "Qualified & scored");
  return getLead(id);
}

// ---- Campaigns v2 + join ----

export function createCampaignV2({ module = "local", name, channel = "multi" }) {
  const db = getDb();
  const info = db
    .prepare(`INSERT INTO campaigns_v2 (created_at, module, name, channel, status) VALUES (?, ?, ?, ?, 'draft')`)
    .run(new Date().toISOString(), module, name || "Untitled campaign", channel);
  return getCampaignV2(info.lastInsertRowid);
}

export function listCampaignsV2(module) {
  const db = getDb();
  const rows = module
    ? db.prepare(`SELECT * FROM campaigns_v2 WHERE module = ? ORDER BY id DESC`).all(module)
    : db.prepare(`SELECT * FROM campaigns_v2 ORDER BY id DESC`).all();
  const counts = {};
  for (const r of db.prepare(`SELECT campaign_id, COUNT(*) n,
        SUM(CASE WHEN email_message IS NOT NULL AND email_message != '' THEN 1 ELSE 0 END) m
      FROM campaign_leads GROUP BY campaign_id`).all()) {
    counts[r.campaign_id] = { leads: r.n, messaged: r.m };
  }
  return rows.map((r) => ({
    id: r.id, createdAt: r.created_at, module: r.module, name: r.name,
    channel: r.channel, status: r.status,
    leadCount: counts[r.id]?.leads || 0, messagedCount: counts[r.id]?.messaged || 0,
  }));
}

// Hydrated campaign: metadata + its linked leads with per-campaign messages +
// engagement. Shapes `leads`/`qualified`/`messages` like the old model so
// MessageTabs/LeadDrawer/export reuse without changes.
export function getCampaignV2(id) {
  const db = getDb();
  const c = db.prepare(`SELECT * FROM campaigns_v2 WHERE id = ?`).get(id);
  if (!c) return null;
  const links = db
    .prepare(
      `SELECT cl.*, l.* FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id
         WHERE cl.campaign_id = ? ORDER BY cl.added_at`
    )
    .all(id);
  const leads = [], qualified = [], messages = [], members = [];
  for (const r of links) {
    const lr = leadRow(r); // r has lead columns too (l.* last wins for shared names)
    members.push({ ...lr, engagement: r.engagement || "", linkLeadId: r.lead_id, lastTouchAt: r.last_touch_at || null });
    leads.push(lr);
    if (lr.card) qualified.push(lr.card);
    if (r.email_message || r.whatsapp_message || r.call_script) {
      messages.push({
        leadId: r.lead_id,
        engagement: r.engagement || "",
        name: lr.name,
        email: { subject: r.email_subject || "", body: r.email_message || "" },
        whatsapp: r.whatsapp_message || "",
        callScript: r.call_script || "",
      });
    }
  }
  return {
    id: c.id, createdAt: c.created_at, module: c.module, name: c.name,
    channel: c.channel, status: c.status, sequenceId: c.sequence_id ?? null,
    domain: c.domain, city: c.city, niche: c.niche,
    leads, qualified, messages, members,
    leadsFound: leads.length,
  };
}

export function addLeadsToCampaign(campaignId, leadIds = []) {
  const db = getDb();
  const ins = db.prepare(`INSERT OR IGNORE INTO campaign_leads (campaign_id, lead_id, added_at) VALUES (?, ?, ?)`);
  const mark = db.prepare(`UPDATE leads SET status = 'in_campaign' WHERE id = ? AND status IN ('new','qualified')`);
  const now = new Date().toISOString();
  let added = 0;
  db.transaction(() => {
    for (const lid of leadIds) {
      if (ins.run(campaignId, lid, now).changes) added++;
      mark.run(lid);
    }
  })();
  return added;
}

// Save generated messages for one lead in one campaign; advance statuses.
export function saveCampaignLeadMessages(campaignId, leadId, msg) {
  const db = getDb();
  db.prepare(
    `UPDATE campaign_leads SET email_subject=@es, email_message=@em, whatsapp_message=@wm, call_script=@cs
       WHERE campaign_id=@cid AND lead_id=@lid`
  ).run({
    cid: campaignId, lid: leadId,
    es: msg.email?.subject || "", em: msg.email?.body || "",
    wm: msg.whatsapp || "", cs: msg.callScript || "",
  });
  db.prepare(`UPDATE leads SET status='messaged' WHERE id=? AND status IN ('new','qualified','in_campaign')`).run(leadId);
}

export function saveMeetingKit(campaignId, leadId, kit) {
  getDb().prepare(`UPDATE campaign_leads SET meeting_kit=? WHERE campaign_id=? AND lead_id=?`)
    .run(JSON.stringify(kit), campaignId, leadId);
}

export function setCampaignV2Status(id, status) {
  getDb().prepare(`UPDATE campaigns_v2 SET status=? WHERE id=?`).run(status, id);
}

// Delete a campaign (its campaign_leads links cascade; leads themselves stay in
// the hub — they're reusable and may be in other campaigns).
export function deleteCampaignV2(id) {
  getDb().prepare(`DELETE FROM campaigns_v2 WHERE id = ?`).run(id);
}

// Per-campaign engagement + global lead status sync + follow-up task automation
// (mirrors the old setOutcome behavior, re-keyed to lead_id).
const ENGAGEMENT_TO_LIFECYCLE = { contacted: "sent", replied: "replied", meeting: "meeting_booked", won: "won", lost: "lost" };
export function setEngagement(campaignId, leadId, patch) {
  const db = getDb();
  if (patch.engagement != null) {
    const now = new Date().toISOString();
    db.prepare(`UPDATE campaign_leads SET engagement=?, last_touch_at=? WHERE campaign_id=? AND lead_id=?`)
      .run(patch.engagement, now, campaignId, leadId);
    if (patch.engagement && patch.engagement !== "new") logLeadEvent(leadId, "engagement", `Marked ${patch.engagement}`);
    // sync global lead lifecycle (don't regress past a terminal)
    const lc = ENGAGEMENT_TO_LIFECYCLE[patch.engagement];
    if (lc) db.prepare(`UPDATE leads SET status=?, status_updated_at=? WHERE id=?`).run(lc, now, leadId);
    // follow-up task automation
    const lead = db.prepare(`SELECT business_name FROM leads WHERE id=?`).get(leadId);
    if (patch.engagement === "contacted") {
      // If the campaign runs a cadence, seed step 0; otherwise the generic +3d follow-up.
      const open = db.prepare(`SELECT id FROM tasks WHERE lead_id=? AND done=0 LIMIT 1`).get(leadId);
      if (!open) {
        const c = db.prepare(`SELECT sequence_id FROM campaigns_v2 WHERE id=?`).get(campaignId);
        const seq = c?.sequence_id ? getSequence(c.sequence_id) : null;
        if (seq && seq.steps.length) {
          scheduleSequenceStep(campaignId, leadId, lead?.business_name, seq.steps, 0);
        } else {
          ensureFollowUpTaskV2(campaignId, leadId, lead?.business_name, 3);
        }
      }
    } else if (["replied", "meeting", "won", "lost"].includes(patch.engagement)) {
      completeTasksForLeadV2(leadId);
    }
    // First real touch activates the campaign (never downgrade active/terminal).
    if (patch.engagement && patch.engagement !== "new") {
      const c = db.prepare(`SELECT status FROM campaigns_v2 WHERE id=?`).get(campaignId);
      if (c && c.status !== "active") setCampaignV2Status(campaignId, "active");
    }
  }
  if (patch.deal) patchLead(leadId, { deal: patch.deal });
  return getCampaignV2(campaignId);
}

function ensureFollowUpTaskV2(campaignId, leadId, leadName, inDays = 3) {
  const db = getDb();
  const open = db.prepare(`SELECT id FROM tasks WHERE lead_id=? AND done=0 LIMIT 1`).get(leadId);
  if (open) return;
  const now = new Date();
  const due = new Date(now.getTime() + inDays * 86400000).toISOString();
  db.prepare(`INSERT INTO tasks (created_at, due_at, campaign_id, lead_name, lead_id, kind, note) VALUES (?,?,?,?,?, 'follow_up','')`)
    .run(now.toISOString(), due, campaignId, leadName || "", leadId);
}
function completeTasksForLeadV2(leadId) {
  getDb().prepare(`UPDATE tasks SET done=1, done_at=? WHERE lead_id=? AND done=0`).run(new Date().toISOString(), leadId);
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

// ---- Sequences / cadences ----

function seqRow(r) {
  if (!r) return null;
  return { id: r.id, module: r.module, name: r.name, steps: parse(r.steps_json) || [], createdAt: r.created_at };
}

// Sanitize step list to the lean shape {channel, dayOffset, label}.
function cleanSteps(steps) {
  const CH = new Set(["email", "whatsapp", "call"]);
  return (Array.isArray(steps) ? steps : [])
    .map((s) => ({
      channel: CH.has(s?.channel) ? s.channel : "email",
      dayOffset: Math.max(0, Math.round(Number(s?.dayOffset) || 0)),
      label: String(s?.label || "").trim().slice(0, 80),
    }))
    .slice(0, 12);
}

export function listSequences(module) {
  const db = getDb();
  const rows = module
    ? db.prepare(`SELECT * FROM sequences WHERE module = ? ORDER BY id DESC`).all(module)
    : db.prepare(`SELECT * FROM sequences ORDER BY id DESC`).all();
  return rows.map(seqRow);
}

export function getSequence(id) {
  return seqRow(getDb().prepare(`SELECT * FROM sequences WHERE id = ?`).get(id));
}

export function createSequence({ module = "local", name, steps }) {
  const db = getDb();
  const info = db
    .prepare(`INSERT INTO sequences (module, name, steps_json, created_at) VALUES (?, ?, ?, ?)`)
    .run(module, String(name || "Untitled cadence").trim(), JSON.stringify(cleanSteps(steps)), new Date().toISOString());
  return getSequence(info.lastInsertRowid);
}

export function updateSequence(id, { name, steps }) {
  const db = getDb();
  const cur = getSequence(id);
  if (!cur) return null;
  db.prepare(`UPDATE sequences SET name = ?, steps_json = ? WHERE id = ?`).run(
    name != null ? String(name).trim() : cur.name,
    JSON.stringify(steps != null ? cleanSteps(steps) : cur.steps),
    id
  );
  return getSequence(id);
}

export function deleteSequence(id) {
  const db = getDb();
  // Detach from any campaigns still pointing at it, then remove.
  db.prepare(`UPDATE campaigns_v2 SET sequence_id = NULL WHERE sequence_id = ?`).run(id);
  db.prepare(`DELETE FROM sequences WHERE id = ?`).run(id);
}

// Attach (or detach with null) a cadence to a campaign.
export function setCampaignSequence(campaignId, sequenceId) {
  getDb()
    .prepare(`UPDATE campaigns_v2 SET sequence_id = ? WHERE id = ?`)
    .run(sequenceId ?? null, campaignId);
  return getCampaignV2(campaignId);
}

// Schedule a sequence step's follow-up task for a lead. stepIndex picks the step;
// due = now + step.dayOffset days. Returns the inserted task id (or null).
function scheduleSequenceStep(campaignId, leadId, leadName, steps, stepIndex) {
  const step = steps[stepIndex];
  if (!step) return null;
  const db = getDb();
  const due = new Date(Date.now() + (step.dayOffset || 0) * 86400000).toISOString();
  const note = [step.label, step.channel].filter(Boolean).join(" · ");
  const info = db
    .prepare(`INSERT INTO tasks (created_at, due_at, campaign_id, lead_name, lead_id, kind, note, step_index)
              VALUES (?,?,?,?,?, 'follow_up', ?, ?)`)
    .run(new Date().toISOString(), due, campaignId, leadName || "", leadId, note, stepIndex);
  return info.lastInsertRowid;
}

// After a follow-up task is completed, schedule the NEXT sequence step (if the
// campaign runs a cadence and there is one). Called from the tasks `complete`
// action. No-op for non-sequenced campaigns / ad-hoc tasks (step_index null).
export function advanceSequence(taskId) {
  const db = getDb();
  const t = db.prepare(`SELECT campaign_id, lead_id, lead_name, step_index FROM tasks WHERE id = ?`).get(taskId);
  if (!t || t.step_index == null) return null;
  const c = db.prepare(`SELECT sequence_id FROM campaigns_v2 WHERE id = ?`).get(t.campaign_id);
  if (!c?.sequence_id) return null;
  const seq = getSequence(c.sequence_id);
  if (!seq) return null;
  const next = t.step_index + 1;
  if (next >= seq.steps.length) return null; // cadence finished
  return scheduleSequenceStep(t.campaign_id, t.lead_id, t.lead_name, seq.steps, next);
}

// ---- Lead activity log + suppression ----

// Append an event to a lead's timeline. Best-effort: never throw into the caller
// (logging must not break a lead write).
export function logLeadEvent(leadId, kind, detail = "") {
  try {
    getDb()
      .prepare(`INSERT INTO lead_events (lead_id, created_at, kind, detail) VALUES (?,?,?,?)`)
      .run(leadId, new Date().toISOString(), kind, String(detail).slice(0, 200));
  } catch {
    /* ignore — activity log is best-effort */
  }
}

export function listLeadEvents(leadId) {
  return getDb()
    .prepare(`SELECT id, created_at AS createdAt, kind, detail FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC, id DESC`)
    .all(leadId);
}

// Toggle do-not-contact. Logs the change to the timeline.
export function setLeadSuppressed(id, on, reason = "") {
  const db = getDb();
  db.prepare(`UPDATE leads SET suppressed = ?, suppressed_reason = ? WHERE id = ?`)
    .run(on ? 1 : 0, on ? String(reason).slice(0, 200) : null, id);
  logLeadEvent(id, on ? "suppressed" : "unsuppressed", on ? (reason || "Marked do-not-contact") : "Suppression removed");
  return getLead(id);
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
      (created_at, task, provider, model, input_tokens, output_tokens, cost_usd, campaign_id, lead_id, source, module, mock)
     VALUES (@created_at, @task, @provider, @model, @input_tokens, @output_tokens, @cost_usd, @campaign_id, @lead_id, @source, @module, @mock)`
  ).run({
    created_at: new Date().toISOString(),
    task: ev.task || "other",
    provider: ev.provider || "anthropic",
    model: ev.model || "",
    input_tokens: ev.inputTokens || 0,
    output_tokens: ev.outputTokens || 0,
    cost_usd: ev.costUsd || 0,
    campaign_id: ev.campaignId ?? null,
    lead_id: ev.leadId ?? null,
    source: ev.source ?? null,
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

// Module-scoped real spend rollups for the Reports page. All money figures come
// from the usage_events ledger (mock excluded) — the authoritative spend record,
// unlike campaigns_v2.usage_json which is never written. Per-source spend uses
// the new lead_id→leads.source link (falls back to the row's own `source`, then
// '(discovery)' for pre-lead tasks like findLeads).
export function reportRollups(module) {
  const db = getDb();
  const where = `WHERE u.mock = 0${module ? " AND u.module = ?" : ""}`;
  const args = module ? [module] : [];

  const totals = db
    .prepare(`SELECT COALESCE(SUM(u.input_tokens + u.output_tokens),0) AS tokens,
                     COALESCE(SUM(u.cost_usd),0) AS usd,
                     COUNT(*) AS rows
                FROM usage_events u ${where}`)
    .get(...args);

  const byTask = db
    .prepare(`SELECT u.task AS name, COALESCE(SUM(u.cost_usd),0) AS usd,
                     COALESCE(SUM(u.input_tokens + u.output_tokens),0) AS tokens
                FROM usage_events u ${where} GROUP BY u.task ORDER BY usd DESC`)
    .all(...args);

  const byProvider = db
    .prepare(`SELECT u.provider AS name, COALESCE(SUM(u.cost_usd),0) AS usd,
                     COALESCE(SUM(u.input_tokens + u.output_tokens),0) AS tokens
                FROM usage_events u ${where} GROUP BY u.provider ORDER BY usd DESC`)
    .all(...args);

  // Per-source spend: prefer the ledger row's source, else the linked lead's
  // source, else mark as discovery (pre-lead).
  const bySource = db
    .prepare(`SELECT COALESCE(NULLIF(u.source,''), l.source, '(discovery)') AS name,
                     COALESCE(SUM(u.cost_usd),0) AS usd, COUNT(*) AS rows
                FROM usage_events u
                LEFT JOIN leads l ON l.id = u.lead_id
                ${where} GROUP BY name ORDER BY usd DESC`)
    .all(...args);

  return { totals, byTask, byProvider, bySource };
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
  // Chase layer is keyed by lead_id → join leads (which carries module + name).
  const rows = db
    .prepare(
      `SELECT t.id, t.due_at, t.campaign_id, t.lead_id, t.kind, t.note, t.done,
              l.business_name AS lead_name, l.niche, l.city, l.domain, l.module
         FROM tasks t JOIN leads l ON l.id = t.lead_id
        WHERE t.done = 0 ${module ? "AND l.module = ?" : ""}
        ORDER BY t.due_at ASC
        LIMIT ?`
    )
    .all(...(module ? [module, limit] : [limit]));
  const nowIso = new Date().toISOString();
  const out = rows.map((r) => ({
    id: r.id,
    dueAt: r.due_at,
    campaignId: r.campaign_id,
    leadId: r.lead_id,
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
      `SELECT COUNT(*) n FROM tasks t JOIN leads l ON l.id = t.lead_id
        WHERE t.done = 0 AND t.due_at <= ? ${module ? "AND l.module = ?" : ""}`
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

// Separate helper: returns only the DB-stored API keys so callers can
// layer them under process.env without leaking them into /api/settings GET.
export function getApiKeys() {
  const db = getDb();
  const row = db.prepare(`SELECT anthropic_key, gemini_key FROM settings WHERE id = 1`).get();
  return {
    anthropicKey: row?.anthropic_key || "",
    geminiKey: row?.gemini_key || "",
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
           budget_anthropic_anchor = ?, budget_gemini_anchor = ?,
           anthropic_key = ?, gemini_key = ?
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
    s.budgetGeminiAnchor ?? cur.budgetGeminiAnchor,
    // Keys: only update when the caller explicitly passes a non-undefined value;
    // an empty string is a valid "clear the key" signal, so we use ?? not ||.
    s.anthropicKey ?? getApiKeys().anthropicKey,
    s.geminiKey ?? getApiKeys().geminiKey
  );
  return getSettings();
}
