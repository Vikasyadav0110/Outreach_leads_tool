# OutreachPilot — QA Bug Sheet (Manual Test Pass)

**Tester role:** End-user / manual QA
**Date:** 2026-06-13
**Build:** local dev (`next dev`), SQLite `data/outreach.db`
**Test method:** End-to-end pipeline run via the live API + UI/flow trace through the code.
**Environment note:** The app is currently locked in **mock / "Simulated Fallback" mode** because the configured key matches `isMockMode()` ([lib/anthropic.js](../lib/anthropic.js)). All leads, contacts, and messages produced during testing were **fabricated** by [lib/mockData.js](../lib/mockData.js). Several findings below stem directly from that.

Severity: **Critical** (blocks core use / data integrity / can cause user harm) · **High** (breaks a primary flow or has no recovery) · **Medium** (confusing / inconsistent / incomplete) · **Low** (polish).

---

## Summary table

| ID | Severity | Area | Title |
|----|----------|------|-------|
| C1 | Critical | AI / data trust | Silent mock mode produces **fake leads + fake phone/email**, and Send buttons open real `wa.me`/`mailto` to fabricated numbers |
| C2 | Critical | Campaigns | **No way to delete a campaign** (`DELETE` → 405); junk/test campaigns are permanent |
| H1 | High | Pipeline | Pipeline **dead-ends when 0 HIGH leads** (qualify → 400) with no recovery path |
| H2 | High | Lead workbench | Lead drawer has **no "Prep Meeting"** action — the meeting kit is only reachable from qualification cards |
| H3 | High | Data linking | Lead↔card↔message join is by **exact name**; with the real API, variant names silently break the links |
| H4 | High | Localization | `find-leads` **hardcodes "India"** into the query; broken for any non-India city |
| H5 | High | Navigation | "New campaign" (sidebar + ⌘K) is a **no-op on the dashboard** and lands on the welcome wizard at 0 campaigns |
| M1 | Medium | Lead workbench | Clicking a **NORMAL (non-qualified) lead** opens an empty, unexplained drawer |
| M2 | Medium | Outreach actions | **Three inconsistent "contact" surfaces**; qualification-card links open WhatsApp with no message text |
| M3 | Medium | White-label | Accent **live-preview persists without saving** (no revert on navigate-away) |
| M4 | Medium | White-label | Browser **tab title / favicon not white-labeled** (stays "OutreachPilot") |
| M5 | Medium | Cost meter | "Est. cost / spend" is **always $0** (mock) and has no per-agent breakdown; unverifiable in-app |
| M6 | Medium | Copilot | Copilot is **context-blind** — "rewrite this / summarize this lead" has no "this" |
| M7 | Medium | Onboarding | **No in-app way to add an API key**; onboarding step 2 dead-ends telling the user to edit `.env.local` |
| M8 | Medium | Layout | Toast notifications **overlap the Copilot FAB** (both bottom-right) |
| L1 | Low | Command palette | Duplicate commands — "New campaign" and "Go to Dashboard" both route to `/` |
| L2 | Low | Navigation | Sidebar is sparse (Dashboard/Settings only); campaign pages have no distinct nav context |
| L3 | Low | Export | Two export concepts ("Download Kit" txt vs leads "Export CSV") — inconsistent & under-discoverable |
| L4 | Low | Dashboard | A failed run shows status "Failed" even when partial leads exist |

---

## Detailed findings

### C1 — Silent mock mode emits fake leads + fake contacts; Send buttons act on them
**Area:** AI / data trust · **Severity:** Critical
**Repro:**
1. With the current key, create any campaign and run the pipeline.
2. Open a HIGH lead → drawer → **Send WhatsApp** / **Send email**, or use the Messages tab.
**Expected:** Either real, verified contacts, or an unmistakable block on acting on simulated data.
**Actual:** Leads are template names ("Testville Cafe Hub"), the qualifier invents a phone (`+91 98765 0000x`) and email, and the **Send WhatsApp / Call / Email buttons build live `wa.me`/`tel:`/`mailto:` links to those fabricated numbers** ([mockData.js](../lib/mockData.js) `generateMockQualify`). A user can unknowingly message a random real person who happens to own that number.
**Fix ideas:** In mock mode, disable/із label the Send actions ("Simulated — sending disabled"), use obviously-fake sentinels (e.g. `+91 00000 00000`), and add a persistent banner explaining outputs are not real. Pair with M7 (let users add a real key).

### C2 — Campaigns can't be deleted
**Area:** Campaigns · **Severity:** Critical (data hygiene)
**Repro:** `curl -X DELETE /api/campaigns/5` → **HTTP 405**. There is no delete control anywhere in the UI.
**Expected:** Delete (or archive) a campaign from the dashboard/campaign page.
**Actual:** No `DELETE` handler in [app/api/campaigns/[id]/route.js](../app/api/campaigns/[id]/route.js) and no UI affordance. Test/junk campaigns (e.g. the "Testville · Cafe" one created during this pass) are permanent and clutter the dashboard, stats, and charts forever.
**Fix ideas:** Add a `DELETE` route (cascade already set on `lead_outcomes`) + a confirm-delete action on each campaign row / campaign page.

### H1 — Pipeline dead-ends with zero HIGH-priority leads
**Area:** Pipeline · **Severity:** High
**Repro:** Run a campaign where Agent 1 returns only leads scored < 7 (random in mock; common with strong-presence niches live).
**Expected:** A path forward (qualify NORMAL leads, lower the threshold, or clear guidance).
**Actual:** `qualify` returns **400 "No HIGH-priority leads (score >= 7) to qualify."** ([qualify/route.js](../app/api/agents/qualify/route.js)). The runner shows an error and the campaign is stuck at "found" with no way to proceed — the only leads it found are unreachable by the rest of the product.
**Fix ideas:** Allow qualifying NORMAL leads (manual select), or make the HIGH threshold configurable, or auto-fallback to top-N by score.

### H2 — Lead drawer is missing the "Prep Meeting" action
**Area:** Lead workbench · **Severity:** High (broken linking)
**Repro:** Open a lead via the leads-table name → drawer. There's status, messages, notes, timeline — but **no way to generate the meeting kit**.
**Expected:** The consolidated lead workbench (drawer) should be the one place to do everything, including Prep Meeting.
**Actual:** The meeting kit is only launchable from the **QualificationCards** "Prep Meeting" button ([QualificationCards.js](../app/components/QualificationCards.js)); [LeadDrawer.js](../app/components/LeadDrawer.js) never receives an `onPrep`. The two lead views are disconnected.
**Fix ideas:** Add a "Prep meeting" button in the drawer that opens `MeetingModal` for that lead.

### H3 — Lead↔card↔message linking is by exact name (fragile with real AI)
**Area:** Data linking · **Severity:** High (latent)
**Repro (live key):** Run the pipeline; if Agent 2/3 return a business name even slightly different from Agent 1 ("Om Sai Builder" vs "Om Sai Builders Pvt Ltd").
**Expected:** Each lead reliably shows its qualification card + messages.
**Actual:** [LeadsTable.js](../app/components/LeadsTable.js) / [MessageTabs.js](../app/components/MessageTabs.js) match by `name.trim().toLowerCase()`. A name drift means the drawer/messages **silently show nothing** for that lead. (Not reproducible in mock because mock reuses the exact name — so it's invisible until live.)
**Fix ideas:** Assign a stable lead `id` at Agent 1 and carry it through Agents 2–3 instead of matching on name.

### H4 — "India" is hardcoded into lead search
**Area:** Localization · **Severity:** High (for non-India users)
**Repro:** Create a campaign for "London / Plumbers".
**Expected:** Search London plumbers.
**Actual:** The Agent 1 user message hardcodes `…in ${city}, India.` ([lib/agents.js](../lib/agents.js)); the domain prompts are India-only (JustDial, Hinglish, ₹). A non-India campaign gets wrong context.
**Fix ideas:** Add a country field to the campaign; parameterize the prompt + sources.

### H5 — "New campaign" CTA is inconsistent / a no-op
**Area:** Navigation · **Severity:** High (primary action)
**Repro:** On the dashboard, click sidebar **+ New campaign** (or ⌘K → "New campaign"). On a fresh (0-campaign) account, do the same.
**Expected:** Always lands you on a campaign-creation form / focuses it.
**Actual:** Both just route to `/` ([Sidebar.js](../app/components/Sidebar.js), [CommandPalette.js](../app/components/CommandPalette.js)). If you're already on `/`, **nothing happens** (no scroll/focus to the create card). On 0 campaigns, `/` shows the **onboarding wizard**, so "New campaign" opens a "Welcome 👋" screen — a label/destination mismatch.
**Fix ideas:** Route to a dedicated `/campaigns/new`, or scroll-to + focus the create card, or open creation in a modal.

### M1 — NORMAL leads open an empty, unexplained drawer
**Repro:** Click a lead with score < 7 (not qualified). **Actual:** Drawer shows Gap/Decision maker/WhatsApp/Email all "—", no Messages section, all Send buttons disabled, with no note that this lead was skipped because score < 7. Looks broken. **Fix:** Show a "Not qualified (score < 7)" explainer + a "Qualify this lead" action.

### M2 — Three inconsistent contact/send surfaces
**Repro:** Compare the WhatsApp action in (a) Messages tab, (b) qualification card row, (c) lead drawer. **Actual:** (a) and (c) prefill the generated message; (b) the qualification-card link opens `wa.me` with **no text** ([QualificationCards.js](../app/components/QualificationCards.js) `waHref(c.whatsapp)`), and `mailto` with empty subject/body. Same-looking action, different result. **Fix:** Consolidate to one send component; always prefill the message.

### M3 — Accent live-preview sticks without saving
**Repro:** Settings → pick a different accent swatch → **don't** save → navigate around. **Actual:** The whole app stays the new color (inline `--accent` on `<html>`), and only resets on a hard reload ([settings/page.js](../app/settings/page.js) `applyAccent`). Confusing — looks saved when it isn't. **Fix:** Revert the preview on unmount unless saved, or show a "Preview — Save to keep" hint.

### M4 — Tab title / favicon not white-labeled
**Repro:** Set brand name "Acme Digital", save. **Actual:** Sidebar updates, but the browser tab still says **OutreachPilot** (static `metadata.title` in [layout.js](../app/layout.js)) and favicon is unchanged. Incomplete white-label for the agency-resale use case. **Fix:** `generateMetadata()` reading saved brand name; allow a logo/favicon upload.

### M5 — Cost meter is always $0 and unverifiable
**Repro:** Run any campaign → campaign "Est. cost" and dashboard "Est. spend" show **$0.00**. **Actual:** Capture works only on real API calls; in mock mode usage is `{0,0,0}`. Because the app is stuck in mock (C1/M7), the headline cost feature is never exercised. No per-agent breakdown either. **Fix:** tie to M7; add a tooltip "Simulated — $0 in mock mode"; show per-agent token split.

### M6 — Copilot has no context
**Repro:** On a campaign, open the Copilot, click "Make this more formal:". **Actual:** There's no "this" — the copilot doesn't know the current campaign/lead/message ([Copilot.js](../app/components/Copilot.js) sends only chat text). The report promised "summarize this lead's gap / rewrite this WhatsApp"; today it's a generic chatbot. **Fix:** Pass current campaign/lead context into `/api/copilot`.

### M7 — No in-app API key entry; onboarding dead-ends in mock
**Repro:** Fresh user, onboarding step 2 ("AI status"). **Actual:** It says you're in Simulated mode and to "add a valid ANTHROPIC_API_KEY in .env.local and restart" — there is **no UI to do this**, so a non-developer can never leave mock mode. **Fix:** Allow entering/storing the key from Settings (server-side), or document clearly that it's developer-only.

### M8 — Toasts overlap the Copilot button
**Repro:** Trigger a toast (e.g., change a lead status) with the Copilot FAB visible. **Actual:** Toaster (`z-[60]`, bottom-right) renders over the Copilot FAB (`z-[55]`, bottom-right). **Fix:** Offset the toaster (e.g., bottom-left) or stack above the FAB.

### L1 — Command palette duplicate destinations
"New campaign" and "Go to Dashboard" both go to `/`. Consider removing one or giving "New campaign" a real target.

### L2 — Sparse sidebar / no campaign nav context
Only Dashboard + Settings. On a campaign page nothing in the nav indicates where you are beyond "Dashboard". Consider a "Campaigns" section and breadcrumbs.

### L3 — Two export mechanisms
"Download Kit" (txt, appears only after messages exist, in [CampaignRunner.js](../app/campaign/[id]/CampaignRunner.js)) vs leads-table "Export CSV". Unify or clearly differentiate.

### L4 — "Failed" status with partial data
If a run errors after Agent 1, the dashboard pill shows "Failed" even though leads exist and are usable. Consider "Partial" / show what's available.

---

## What works well (verified this pass)
- Full pipeline completes end-to-end in mock: **10 leads → 9 HIGH → 9 qualified → 9 messages**, names linked correctly; all routes 200; status → "ready".
- Per-lead **status pipeline** persists (status + notes round-trip 200) and the summary/rollup/dashboard funnel update.
- **CSV export**, **command palette** affordance, **copilot** route (mock reply 200), **white-label** accent round-trip (violet applied, reverted), and **stat tiles/charts** all render.
- Responsive shell, skeletons, toasts, and modal a11y (Esc/scroll-lock/focus) are in place.

## Top 5 to fix first
1. **C1** — stop mock mode from emitting actionable fake contacts (data-trust/safety).
2. **C2** — add campaign delete/archive.
3. **H1** — give the pipeline a path when there are no HIGH leads.
4. **H2** — add "Prep meeting" to the lead drawer (unify the workbench).
5. **H5/M7** — make "New campaign" always work and let users leave mock mode in-app.
