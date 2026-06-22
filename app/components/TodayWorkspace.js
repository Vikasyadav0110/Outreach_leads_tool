"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ScoreBadge from "./ScoreBadge";
import StatusBadge from "./StatusBadge";
import EmptyState from "./EmptyState";
import LeadDetailDrawer from "./LeadDetailDrawer";
import FocusMode from "./FocusMode";
import { AddToCampaignModal } from "./LeadsHub";
import { fmtDate } from "./format";
import { toast } from "./toast";

// The "Today" workspace — the daily home screen. Answers "what do I do right
// now?" with three action queues:
//   1. Follow-ups due  — the chase queue (auto-scheduled tasks, overdue first)
//   2. Replies to action — leads that replied with nothing scheduled next
//   3. Hot new leads   — qualified leads not yet in any campaign
// Plus a keyboard-driven Focus mode to rip through the due follow-ups.

function dueLabel(iso, overdue) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return "Today";
  return overdue ? `Overdue · ${fmtDate(iso)}` : fmtDate(iso);
}

// Full Tailwind class strings (no interpolation) so the JIT compiler picks them up.
const COUNT_PILL = {
  accent: "badge bg-accent/10 text-accent",
  warning: "badge bg-amber-50 text-warning",
  accent2: "badge bg-accent2/10 text-accent2",
};

function QueueSection({ title, count, accent = "accent", children }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {count > 0 && <span className={COUNT_PILL[accent] || COUNT_PILL.accent}>{count}</span>}
      </div>
      {children}
    </section>
  );
}

export default function TodayWorkspace({
  tasks = [],
  replies = [],
  hot = [],
  campaigns = [],
  mock = false,
}) {
  const router = useRouter();
  const [taskList, setTaskList] = useState(tasks);
  const [replyList, setReplyList] = useState(replies);
  const [hotList, setHotList] = useState(hot);
  const [busy, setBusy] = useState(null); // id currently acting on
  const [openLead, setOpenLead] = useState(null);
  const [focus, setFocus] = useState(false);
  const [addLead, setAddLead] = useState(null); // hot lead being added to a campaign

  const overdue = useMemo(() => taskList.filter((t) => t.overdue).length, [taskList]);

  // ---- task actions (reuse the existing /api/tasks endpoint) ----
  async function taskAct(id, action, days) {
    setBusy(id);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, days }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed.");
      setTaskList((ts) => ts.filter((t) => t.id !== id));
      toast(action === "complete" ? "Marked done." : "Snoozed to tomorrow.");
      router.refresh();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  // ---- reply actions (lead-scoped engagement) ----
  async function setReplyEngagement(lead, engagement) {
    setBusy(`r-${lead.id}`);
    try {
      const res = await fetch(`/api/leads/${lead.id}/engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: lead.campaignId, engagement }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed.");
      setReplyList((rs) => rs.filter((r) => r.id !== lead.id));
      toast(`${lead.name} → ${engagement}`);
      router.refresh();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  const empty =
    taskList.length === 0 && replyList.length === 0 && hotList.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="h-display text-xl text-ink">Today</h1>
          <p className="mt-0.5 text-sm text-muted">
            {empty
              ? "You're all caught up — no follow-ups, replies, or hot leads waiting."
              : `${taskList.length} follow-up${taskList.length === 1 ? "" : "s"} due${
                  overdue ? ` · ${overdue} overdue` : ""
                }${replyList.length ? ` · ${replyList.length} repl${replyList.length === 1 ? "y" : "ies"} to action` : ""}.`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {taskList.length > 0 && (
            <button type="button" onClick={() => setFocus(true)} className="btn-primary px-4 py-2 text-sm">
              ▶ Work my day
            </button>
          )}
          <Link href="/analytics" className="btn-ghost px-4 py-2 text-sm">View analytics</Link>
        </div>
      </div>

      {empty ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
          title="Nothing needs you right now"
          hint="When you contact leads, follow-ups land here automatically. Find or qualify leads to fill your day."
          action={<Link href="/leads" className="btn-primary">Go to Leads</Link>}
        />
      ) : (
        <>
          {/* 1 — Follow-ups due */}
          <QueueSection title="Follow-ups due" count={taskList.length}>
            {taskList.length === 0 ? (
              <p className="card p-4 text-sm text-muted">No follow-ups scheduled. Nice and clear.</p>
            ) : (
              <div className="card divide-y divide-line p-0">
                {taskList.slice(0, 12).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${t.overdue ? "bg-danger" : "bg-accent"}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">
                        {t.leadName}
                        {t.note ? <span className="ml-2 font-normal text-accent">· {t.note}</span> : ""}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {dueLabel(t.dueAt, t.overdue)}
                        {t.niche ? ` · ${t.niche}` : ""}
                        {t.city ? ` · ${t.city}` : ""}
                      </div>
                    </div>
                    <Link href={`/campaign/${t.campaignId}`} className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/5">
                      Open
                    </Link>
                    <button type="button" onClick={() => taskAct(t.id, "snooze", 1)} disabled={busy === t.id} className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-50" title="Snooze 1 day">
                      Snooze
                    </button>
                    <button type="button" onClick={() => taskAct(t.id, "complete")} disabled={busy === t.id} className="shrink-0 rounded-md bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-[#046c4e] disabled:opacity-50">
                      Done
                    </button>
                  </div>
                ))}
              </div>
            )}
          </QueueSection>

          {/* 2 — Replies to action */}
          <QueueSection title="Replies to action" count={replyList.length} accent="warning">
            {replyList.length === 0 ? (
              <p className="card p-4 text-sm text-muted">No replies waiting. Replies you mark in a campaign show up here.</p>
            ) : (
              <div className="card divide-y divide-line p-0">
                {replyList.map((l) => {
                  const acting = busy === `r-${l.id}`;
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                      <button type="button" onClick={() => setOpenLead(l)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-sm font-medium text-ink hover:text-accent hover:underline">{l.name}</div>
                        <div className="truncate text-xs text-muted">
                          Replied{l.lastTouchAt ? ` · ${fmtDate(l.lastTouchAt)}` : ""}
                          {l.niche ? ` · ${l.niche}` : ""}{l.city ? ` · ${l.city}` : ""}
                        </div>
                      </button>
                      <button type="button" onClick={() => setReplyEngagement(l, "meeting")} disabled={acting} className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50">
                        Booked meeting
                      </button>
                      <button type="button" onClick={() => setReplyEngagement(l, "won")} disabled={acting} className="shrink-0 rounded-md bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-[#046c4e] disabled:opacity-50">
                        Won
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </QueueSection>

          {/* 3 — Hot new leads */}
          <QueueSection title="Hot new leads" count={hotList.length} accent="accent2">
            {hotList.length === 0 ? (
              <p className="card p-4 text-sm text-muted">No qualified leads waiting to be worked. Qualify leads in the hub to fill this.</p>
            ) : (
              <div className="card divide-y divide-line p-0">
                {hotList.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <ScoreBadge score={l.score} />
                    <button type="button" onClick={() => setOpenLead(l)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium text-ink hover:text-accent hover:underline">{l.name}</div>
                      <div className="truncate text-xs text-muted">
                        {l.niche ? `${l.niche}` : ""}{l.city ? ` · ${l.city}` : ""}
                        {l.gap ? ` · ${l.gap}` : ""}
                      </div>
                    </button>
                    <StatusBadge status={l.status} kind="lifecycle" />
                    <button type="button" onClick={() => setAddLead(l)} className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1647b8]">
                      Add to campaign
                    </button>
                  </div>
                ))}
              </div>
            )}
          </QueueSection>
        </>
      )}

      {openLead && (
        <LeadDetailDrawer
          lead={openLead}
          mock={mock}
          onClose={() => setOpenLead(null)}
          onChanged={() => { setOpenLead(null); router.refresh(); }}
        />
      )}

      {addLead && (
        <AddToCampaignModal
          count={1}
          campaigns={campaigns}
          leadIds={[addLead.id]}
          onClose={() => setAddLead(null)}
          onDone={() => {
            setHotList((hs) => hs.filter((h) => h.id !== addLead.id));
            setAddLead(null);
            router.refresh();
          }}
        />
      )}

      {focus && (
        <FocusMode
          tasks={taskList}
          onClose={() => { setFocus(false); router.refresh(); }}
          onResolve={(id) => setTaskList((ts) => ts.filter((t) => t.id !== id))}
        />
      )}
    </div>
  );
}
