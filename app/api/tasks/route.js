import { NextResponse } from "next/server";
import { listTasks, completeTask, snoozeTask, createTask } from "@/lib/db";
import { getActiveModule } from "@/lib/activeModule";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

// GET open follow-up tasks for the active module (overdue first).
export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    return NextResponse.json({ tasks: listTasks({ module: getActiveModule() }) });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not load tasks." }, { status: 500 });
  }
}

// POST { action: 'complete' | 'snooze' | 'create', ... }
export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = await req.json();
    const { action } = body;
    if (action === "complete") {
      if (!Number.isInteger(body.id)) {
        return NextResponse.json({ error: "id is required." }, { status: 400 });
      }
      completeTask(body.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "snooze") {
      if (!Number.isInteger(body.id)) {
        return NextResponse.json({ error: "id is required." }, { status: 400 });
      }
      snoozeTask(body.id, Number(body.days) > 0 ? Number(body.days) : 1);
      return NextResponse.json({ ok: true });
    }
    if (action === "create") {
      if (!Number.isInteger(body.campaignId) || !body.leadName || !body.dueAt) {
        return NextResponse.json({ error: "campaignId, leadName, dueAt required." }, { status: 400 });
      }
      const t = createTask({
        campaignId: body.campaignId,
        leadName: String(body.leadName),
        dueAt: String(body.dueAt),
        kind: body.kind || "custom",
        note: body.note || "",
      });
      return NextResponse.json({ ok: true, id: t.id });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Task action failed." }, { status: 500 });
  }
}
