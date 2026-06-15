"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate } from "./format";
import { toast } from "./toast";

// Dashboard "Today" list — the chase queue. Shows open follow-up tasks
// (overdue first) with one-click complete / snooze and a link to the lead's
// campaign. This is the single highest-leverage sales surface: it makes sure no
// follow-up is forgotten.
function dueLabel(iso, overdue) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Today";
  return overdue ? `Overdue · ${fmtDate(iso)}` : fmtDate(iso);
}

export default function TodayTasks({ initialTasks = [] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [busy, setBusy] = useState(null);

  // Keep in sync if the server re-renders with fresh tasks.
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  async function act(id, action, days) {
    setBusy(id);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, days }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed.");
      setTasks((ts) => ts.filter((t) => t.id !== id));
      toast(action === "complete" ? "Marked done." : "Snoozed to tomorrow.");
      router.refresh();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  if (!tasks.length) return null;

  const overdue = tasks.filter((t) => t.overdue).length;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Today’s follow-ups
          <span className="ml-2 font-normal text-muted">
            {tasks.length} open{overdue ? ` · ${overdue} overdue` : ""}
          </span>
        </h2>
      </div>
      <div className="card divide-y divide-line p-0">
        {tasks.slice(0, 8).map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${t.overdue ? "bg-danger" : "bg-accent"}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{t.leadName}</div>
              <div className="truncate text-xs text-muted">
                {dueLabel(t.dueAt, t.overdue)} · {t.niche} · {t.city}
              </div>
            </div>
            <Link
              href={`/campaign/${t.campaignId}`}
              className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/5"
            >
              Open
            </Link>
            <button
              type="button"
              onClick={() => act(t.id, "snooze", 1)}
              disabled={busy === t.id}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-50"
              title="Snooze 1 day"
            >
              Snooze
            </button>
            <button
              type="button"
              onClick={() => act(t.id, "complete")}
              disabled={busy === t.id}
              className="shrink-0 rounded-md bg-success px-2.5 py-1 text-xs font-medium text-white hover:bg-[#046c4e] disabled:opacity-50"
            >
              Done
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
