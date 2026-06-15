// Pure aggregation helpers for the dashboards. No deps, fully serializable
// output — server pages call these and pass results to the client chart kit.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);
const arrLen = (a) => (Array.isArray(a) ? a.length : 0);

function sumOutcomes(campaigns) {
  const s = { contacted: 0, replied: 0, meeting: 0, won: 0, lost: 0, new: 0 };
  for (const c of campaigns) {
    for (const [k, v] of Object.entries(c.outcomeCounts || {})) {
      s[k] = (s[k] || 0) + v;
    }
  }
  return s;
}

// Cumulative outreach funnel with step-to-step conversion %.
export function funnel(campaigns) {
  const leads = campaigns.reduce((n, c) => n + (c.leadsFound || 0), 0);
  const qualified = campaigns.reduce((n, c) => n + arrLen(c.qualified), 0);
  const messaged = campaigns.reduce((n, c) => n + arrLen(c.messages), 0);
  const o = sumOutcomes(campaigns);
  const contacted = o.contacted + o.replied + o.meeting + o.won;
  const replied = o.replied + o.meeting + o.won;
  const meeting = o.meeting + o.won;
  const won = o.won;

  const raw = [
    ["Leads found", leads],
    ["Qualified", qualified],
    ["Messaged", messaged],
    ["Contacted", contacted],
    ["Replied", replied],
    ["Meeting", meeting],
    ["Won", won],
  ];
  return raw.map(([name, value], i) => ({
    name,
    value,
    conv: i === 0 ? 100 : pct(value, raw[i - 1][1]),
  }));
}

// Status distribution across all leads (untracked leads count as "new").
export function statusMix(campaigns) {
  const totalLeads = campaigns.reduce((n, c) => n + (c.leadsFound || 0), 0);
  const o = sumOutcomes(campaigns);
  const tracked = Object.values(o).reduce((a, b) => a + b, 0);
  return { ...o, new: (o.new || 0) + Math.max(0, totalLeads - tracked) };
}

function weekStartUTC(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m;
}
const weekLabel = (d) => `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;

// Leads added per ISO week (by campaign created_at × leadsFound). `dateKey` and
// `valueFn` let it work for sourced leads / runs too.
export function perWeek(items, dateKey = "createdAt", valueFn = () => 1) {
  const buckets = new Map();
  for (const it of items) {
    const ws = weekStartUTC(it[dateKey]);
    if (!ws) continue;
    const key = ws.getTime();
    buckets.set(key, (buckets.get(key) || 0) + (valueFn(it) || 0));
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, value]) => ({ name: weekLabel(new Date(t)), value }));
}

export const leadsPerWeek = (campaigns) =>
  perWeek(campaigns, "createdAt", (c) => c.leadsFound || 0);

// Per-niche performance from listAllLeads() rows.
export function nichePerformance(allLeads, limit = 8) {
  const map = new Map();
  for (const l of allLeads) {
    const key = (l.niche || "—").trim() || "—";
    const e = map.get(key) || { name: key, leads: 0, won: 0 };
    e.leads += 1;
    if (l.status === "won") e.won += 1;
    map.set(key, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, winRate: pct(e.won, e.leads) }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, limit);
}

// Per-source performance from listSourcedLeads() rows.
export function sourcePerformance(sourcedLeads) {
  const map = new Map();
  for (const l of sourcedLeads) {
    const key = l.source || "—";
    const e = map.get(key) || { name: key, count: 0, scoreSum: 0, deliver: 0, sell: 0 };
    e.count += 1;
    e.scoreSum += Number(l.score) || 0;
    if (l.pipeline === "sell") e.sell += 1;
    else e.deliver += 1;
    map.set(key, e);
  }
  return [...map.values()]
    .map((e) => ({ name: e.name, count: e.count, avgScore: e.count ? +(e.scoreSum / e.count).toFixed(1) : 0, deliver: e.deliver, sell: e.sell }))
    .sort((a, b) => b.count - a.count);
}

// Deal / revenue rollup from listAllLeads() rows (which carry .deal + .status +
// timestamps). Powers the "what am I actually earning" view that mere counts miss.
export function dealStats(allLeads) {
  let wonValue = 0;
  let wonCommission = 0;
  let wonCount = 0;
  let lostCount = 0;
  let closeDaysSum = 0;
  let closeDaysN = 0;
  const lossReasons = new Map();

  for (const l of allLeads) {
    const d = l.deal || {};
    if (l.status === "won") {
      wonCount += 1;
      wonValue += Number(d.value) || 0;
      wonCommission += d.value && d.commissionPct ? (Number(d.value) * Number(d.commissionPct)) / 100 : 0;
      // time-to-close = first-seen (campaign created) → won (outcome updatedAt)
      if (l.campaignCreatedAt && l.updatedAt) {
        const days = (new Date(l.updatedAt) - new Date(l.campaignCreatedAt)) / 86400000;
        if (days >= 0 && days < 3650) { closeDaysSum += days; closeDaysN += 1; }
      }
    } else if (l.status === "lost") {
      lostCount += 1;
      if (d.reason) lossReasons.set(d.reason, (lossReasons.get(d.reason) || 0) + 1);
    }
  }

  return {
    wonCount,
    lostCount,
    wonValue,
    wonCommission,
    avgDealValue: wonCount ? Math.round(wonValue / wonCount) : 0,
    avgCommission: wonCount ? Math.round(wonCommission / wonCount) : 0,
    avgDaysToClose: closeDaysN ? +(closeDaysSum / closeDaysN).toFixed(1) : 0,
    winRate: pct(wonCount, wonCount + lostCount),
    lossReasons: [...lossReasons.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  };
}

// Per-source CONVERSION (not just counts): how many sourced leads from each
// source were pushed into a campaign and how they performed. Joins sourced rows
// to campaign leads by name (case-insensitive).
export function sourceConversion(sourcedLeads, allLeads) {
  const byName = new Map();
  for (const l of allLeads) byName.set((l.name || "").trim().toLowerCase(), l);
  const map = new Map();
  for (const sl of sourcedLeads) {
    const key = sl.source || "—";
    const e = map.get(key) || { name: key, sourced: 0, worked: 0, replied: 0, won: 0 };
    e.sourced += 1;
    const lead = byName.get((sl.name || "").trim().toLowerCase());
    if (lead) {
      e.worked += 1;
      if (["replied", "meeting", "won"].includes(lead.status)) e.replied += 1;
      if (lead.status === "won") e.won += 1;
    }
    map.set(key, e);
  }
  return [...map.values()]
    .map((e) => ({
      ...e,
      replyRate: pct(e.replied, e.worked),
      winRate: pct(e.won, e.worked),
    }))
    .sort((a, b) => b.sourced - a.sourced);
}

// Spend + conversion rates for the KPI row.
export function unitEconomics(campaigns) {
  const leads = campaigns.reduce((n, c) => n + (c.leadsFound || 0), 0);
  const qualified = campaigns.reduce((n, c) => n + arrLen(c.qualified), 0);
  const messaged = campaigns.reduce((n, c) => n + arrLen(c.messages), 0);
  const o = sumOutcomes(campaigns);
  const won = o.won;
  const replied = o.replied + o.meeting + o.won;
  const spend = campaigns.reduce((n, c) => n + (c.usage?.costUsd || 0), 0);
  const tokens = campaigns.reduce(
    (n, c) => n + (c.usage?.inputTokens || 0) + (c.usage?.outputTokens || 0),
    0
  );
  return {
    leads,
    qualified,
    messaged,
    won,
    spend,
    tokens,
    replyRate: pct(replied, messaged),
    winRate: pct(won, qualified || leads),
    costPerLead: leads ? spend / leads : 0,
    costPerQualified: qualified ? spend / qualified : 0,
    costPerWon: won ? spend / won : 0,
  };
}
