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
  `);

  // Additive column for accumulated token usage/cost (older DBs won't have it).
  const cols = db.prepare(`PRAGMA table_info(campaigns)`).all().map((c) => c.name);
  if (!cols.includes("usage_json")) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN usage_json TEXT`);
  }

  // Additive white-label columns on settings.
  const sCols = db.prepare(`PRAGMA table_info(settings)`).all().map((c) => c.name);
  if (!sCols.includes("brand_name")) {
    db.exec(`ALTER TABLE settings ADD COLUMN brand_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!sCols.includes("accent_key")) {
    db.exec(`ALTER TABLE settings ADD COLUMN accent_key TEXT NOT NULL DEFAULT 'blue'`);
  }

  // Additive usage counter on snippets (older snippets tables won't have it).
  const snCols = db.prepare(`PRAGMA table_info(snippets)`).all().map((c) => c.name);
  if (!snCols.includes("uses")) {
    db.exec(`ALTER TABLE snippets ADD COLUMN uses INTEGER NOT NULL DEFAULT 0`);
  }

  // Seed starter templates only the first time the table is created (so a user
  // who deletes them all doesn't get them re-added on restart).
  if (!hadSnippets) seedSnippets(db);
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

export function createCampaign({ domain, city, niche }) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO campaigns (created_at, domain, city, niche, status)
     VALUES (?, ?, ?, ?, 'new')`
  );
  const info = stmt.run(new Date().toISOString(), domain, city, niche);
  return getCampaign(info.lastInsertRowid);
}

export function listCampaigns() {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM campaigns ORDER BY id DESC`).all();

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
export function listAllLeads() {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM campaigns ORDER BY id DESC`).all();

  // One query for all outcomes → map keyed by `${campaignId}::${leadName}`.
  const outcomeByKey = {};
  for (const o of db
    .prepare(`SELECT campaign_id, lead_name, status, notes, updated_at FROM lead_outcomes`)
    .all()) {
    outcomeByKey[`${o.campaign_id}::${o.lead_name}`] = {
      status: o.status,
      notes: o.notes,
      updatedAt: o.updated_at,
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

// ---- Lead outcomes (per-lead pipeline status) ----

// Returns an object keyed by lead name: { [name]: { status, notes, updatedAt } }.
export function getOutcomes(campaignId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT lead_name, status, notes, updated_at
         FROM lead_outcomes WHERE campaign_id = ?`
    )
    .all(campaignId);
  const map = {};
  for (const r of rows) {
    map[r.lead_name] = {
      status: r.status,
      notes: r.notes,
      updatedAt: r.updated_at,
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
  };
  const status = patch.status != null ? patch.status : existing.status;
  const notes = patch.notes != null ? patch.notes : existing.notes;
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO lead_outcomes (campaign_id, lead_name, status, notes, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(campaign_id, lead_name)
     DO UPDATE SET status = excluded.status,
                   notes = excluded.notes,
                   updated_at = excluded.updated_at`
  ).run(campaignId, patch.leadName, status, notes, updatedAt);
  return { status, notes, updatedAt };
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
  };
}

export function saveSettings(s) {
  const db = getDb();
  const cur = getSettings();
  db.prepare(
    `UPDATE settings
       SET name = ?, location = ?, services = ?, price_range = ?, portfolio_line = ?,
           brand_name = ?, accent_key = ?
     WHERE id = 1`
  ).run(
    s.name ?? cur.name,
    s.location ?? cur.location,
    s.services ?? cur.services,
    s.priceRange ?? cur.priceRange,
    s.portfolioLine ?? cur.portfolioLine,
    s.brandName ?? cur.brandName,
    s.accentKey ?? cur.accentKey
  );
  return getSettings();
}
