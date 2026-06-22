// One-time migration: JSON-blob campaigns → normalized leads + campaign_leads.
// Run with `--dry-run` to see the row-count report WITHOUT committing (rolls back).
// Run with `--commit` to apply. Idempotent: guarded by schema_meta.normalized=1.
//
//   node scripts/migrate-normalize.cjs --dry-run
//   node scripts/migrate-normalize.cjs --commit
//
// Safe by construction: only CREATEs the 3 new tables + writes into them; never
// touches the existing campaigns/lead_outcomes/tasks columns. Old UI keeps working.

const path = require("node:path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.OUTREACH_DB_PATH || path.join(process.cwd(), "data", "outreach.db");
const MODE = process.argv.includes("--commit") ? "commit" : "dry-run";

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };
const lc = (s) => (s || "").toString().trim().toLowerCase();
const moduleOf = (row) => row.module || "local";
const idKey = (mod, name, city) => `${mod}|${lc(name)}|${lc(city)}`;
const nz = (v, d = "") => (v == null ? d : v);

// ---- DDL (mirrors what will go into lib/db.js migrate()) ----
function ensureSchema() {
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
      domain TEXT, city TEXT, niche TEXT, usage_json TEXT, error TEXT,
      legacy_id INTEGER
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

    CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT);
  `);
}

function alreadyDone() {
  const r = db.prepare(`SELECT value FROM schema_meta WHERE key='normalized'`).get();
  return r?.value === "1";
}

// Map a campaign's legacy lead-outcome status → (engagement, global lifecycle).
const OUTCOME_TO_ENGAGEMENT = { contacted: "contacted", replied: "replied", meeting: "meeting", won: "won", lost: "lost" };
const ENGAGEMENT_TO_LIFECYCLE = { contacted: "sent", replied: "replied", meeting: "meeting_booked", won: "won", lost: "lost" };

function run() {
  ensureSchema();
  if (alreadyDone()) {
    console.log("Already normalized (schema_meta.normalized=1). Nothing to do.");
    return;
  }

  const campaigns = db.prepare(`SELECT * FROM campaigns ORDER BY id`).all();
  const outcomes = db.prepare(`SELECT * FROM lead_outcomes`).all();
  // outcomeByKey[`${campaign_id}::${lower(name)}`] = row
  const outcomeByKey = {};
  for (const o of outcomes) outcomeByKey[`${o.campaign_id}::${lc(o.lead_name)}`] = o;

  const insLead = db.prepare(`INSERT INTO leads
    (created_at, module, business_name, city, niche, domain, source, website, score, priority, gap,
     qualification_notes, decision_maker, email, phone, whatsapp, title, linkedin, personalization_hook,
     service_tag, contact_source, qualified, status, status_updated_at, notes,
     deal_value, currency, partner, commission_pct, expected_close, reason, identity_key)
    VALUES (@created_at,@module,@business_name,@city,@niche,@domain,@source,@website,@score,@priority,@gap,
     @qualification_notes,@decision_maker,@email,@phone,@whatsapp,@title,@linkedin,@personalization_hook,
     @service_tag,@contact_source,@qualified,@status,@status_updated_at,@notes,
     @deal_value,@currency,@partner,@commission_pct,@expected_close,@reason,@identity_key)`);
  const getLeadByKey = db.prepare(`SELECT id, qualified, status FROM leads WHERE identity_key = ?`);
  const fillLead = db.prepare(`UPDATE leads SET
     website=COALESCE(NULLIF(website,''),@website), score=COALESCE(score,@score),
     gap=COALESCE(NULLIF(gap,''),@gap), qualification_notes=COALESCE(NULLIF(qualification_notes,''),@qualification_notes),
     decision_maker=COALESCE(NULLIF(decision_maker,''),@decision_maker), email=COALESCE(NULLIF(email,''),@email),
     phone=COALESCE(NULLIF(phone,''),@phone), linkedin=COALESCE(NULLIF(linkedin,''),@linkedin),
     service_tag=COALESCE(NULLIF(service_tag,''),@service_tag), qualified=MAX(qualified,@qualified)
     WHERE id=@id`);
  const insCamp = db.prepare(`INSERT INTO campaigns_v2
    (created_at, module, name, channel, status, domain, city, niche, usage_json, error, legacy_id)
    VALUES (@created_at,@module,@name,'multi',@status,@domain,@city,@niche,@usage_json,@error,@legacy_id)`);
  const insLink = db.prepare(`INSERT OR IGNORE INTO campaign_leads
    (campaign_id, lead_id, added_at, email_subject, email_message, whatsapp_message, call_script, engagement)
    VALUES (@campaign_id,@lead_id,@added_at,@email_subject,@email_message,@whatsapp_message,@call_script,@engagement)`);
  const setLeadStatusDeal = db.prepare(`UPDATE leads SET status=@status, status_updated_at=@at,
     deal_value=@deal_value, currency=@currency, partner=@partner, commission_pct=@commission_pct,
     expected_close=@expected_close, reason=@reason WHERE id=@id`);

  let nLeads = 0, nLinks = 0, nCamps = 0, nMsgs = 0, nOutcomesMapped = 0, nReused = 0;

  const tx = db.transaction(() => {
    for (const c of campaigns) {
      const mod = moduleOf(c);
      const leadsArr = parse(c.leads_json) || [];
      const cards = parse(c.qualified_json) || [];
      const msgs = parse(c.messages_json) || [];
      const cardByName = {}; cards.forEach((x) => x?.name && (cardByName[lc(x.name)] = x));
      const msgByName = {}; msgs.forEach((x) => x?.name && (msgByName[lc(x.name)] = x));

      const camp = insCamp.run({
        created_at: c.created_at, module: mod,
        name: `${c.niche || "Campaign"} · ${c.city || ""}`.trim(),
        status: c.status === "ready" ? "active" : c.messages_json ? "messages_ready" : "draft",
        domain: c.domain, city: c.city, niche: c.niche, usage_json: c.usage_json, error: c.error,
        legacy_id: c.id,
      });
      nCamps++;
      const campaignId = camp.lastInsertRowid;

      for (const l of leadsArr) {
        if (!l?.name) continue;
        const key = idKey(mod, l.name, l.city || c.city);
        const card = cardByName[lc(l.name)] || {};
        let lead = getLeadByKey.get(key);
        const qualified = card && Object.keys(card).length ? 1 : 0;
        if (lead) {
          // reuse existing lead (many-to-many); fill any empty fields
          nReused++;
          fillLead.run({
            id: lead.id, website: nz(l.website), score: l.score ?? null, gap: nz(l.gap),
            qualification_notes: nz(card.exactGap), decision_maker: nz(card.decisionMaker),
            email: nz(card.email), phone: nz(card.whatsapp), linkedin: nz(card.linkedin),
            service_tag: nz(card.serviceTag), qualified,
          });
        } else {
          const info = insLead.run({
            created_at: c.created_at, module: mod, business_name: l.name,
            city: nz(l.city, c.city), niche: nz(c.niche), domain: nz(l.domain || c.domain),
            source: nz(l.source), website: nz(l.website), score: l.score ?? null,
            priority: nz(l.priority), gap: nz(l.gap),
            qualification_notes: nz(card.exactGap), decision_maker: nz(card.decisionMaker),
            email: nz(card.email), phone: nz(card.whatsapp), whatsapp: nz(card.whatsapp),
            title: nz(card.title), linkedin: nz(card.linkedin),
            personalization_hook: nz(card.personalizationHook), service_tag: nz(card.serviceTag),
            contact_source: nz(card.contactSource), qualified,
            status: qualified ? "qualified" : "new", status_updated_at: c.created_at, notes: "",
            deal_value: 0, currency: "INR", partner: "", commission_pct: 0, expected_close: "", reason: "",
            identity_key: key,
          });
          lead = { id: info.lastInsertRowid };
          nLeads++;
        }

        const m = msgByName[lc(l.name)] || {};
        const o = outcomeByKey[`${c.id}::${lc(l.name)}`];
        const engagement = o ? (OUTCOME_TO_ENGAGEMENT[o.status] || "") : "";
        const link = insLink.run({
          campaign_id: campaignId, lead_id: lead.id, added_at: c.created_at,
          email_subject: nz(m.email?.subject), email_message: nz(m.email?.body),
          whatsapp_message: nz(m.whatsapp), call_script: nz(m.callScript),
          engagement,
        });
        if (link.changes) nLinks++;
        if (m.email?.body || m.whatsapp || m.callScript) nMsgs++;

        // Map outcome → global lead status + deal (mirror).
        if (o && (o.status !== "new" || o.deal_value)) {
          nOutcomesMapped++;
          const lifecycle = ENGAGEMENT_TO_LIFECYCLE[o.status];
          setLeadStatusDeal.run({
            id: lead.id, status: lifecycle || "in_campaign", at: o.updated_at || c.created_at,
            deal_value: o.deal_value || 0, currency: o.currency || "INR", partner: o.partner || "",
            commission_pct: o.commission_pct || 0, expected_close: o.expected_close || "", reason: o.reason || "",
          });
        }
      }
    }

    if (MODE === "commit") {
      db.prepare(`INSERT INTO schema_meta (key,value) VALUES ('normalized','1')
                  ON CONFLICT(key) DO UPDATE SET value='1'`).run();
    } else {
      throw new Error("__DRY_RUN_ROLLBACK__");
    }
  });

  try {
    tx();
  } catch (e) {
    if (e.message !== "__DRY_RUN_ROLLBACK__") throw e;
  }

  console.log(`\n=== MIGRATION REPORT (${MODE}) ===`);
  console.log(`campaigns (source):      ${campaigns.length}`);
  console.log(`campaigns_v2 (created):  ${nCamps}`);
  console.log(`leads (new unique):      ${nLeads}`);
  console.log(`lead reuses (m2m):       ${nReused}`);
  console.log(`campaign_leads (links):  ${nLinks}`);
  console.log(`links carrying messages: ${nMsgs}`);
  console.log(`outcomes mapped:         ${nOutcomesMapped} / ${outcomes.length}`);
  if (MODE === "dry-run") {
    console.log(`\n(DRY RUN — rolled back, nothing written. Re-run with --commit to apply.)`);
    // verify rollback
    const after = db.prepare(`SELECT COUNT(*) n FROM leads`).get().n;
    console.log(`leads rows in DB after rollback: ${after} (should be 0)`);
  } else {
    const L = db.prepare(`SELECT COUNT(*) n FROM leads`).get().n;
    const CL = db.prepare(`SELECT COUNT(*) n FROM campaign_leads`).get().n;
    const C = db.prepare(`SELECT COUNT(*) n FROM campaigns_v2`).get().n;
    console.log(`\nCommitted. DB now: leads=${L}, campaign_leads=${CL}, campaigns_v2=${C}`);
  }
}

run();
