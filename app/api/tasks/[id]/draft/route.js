import { NextResponse } from "next/server";
import { runWriteStep } from "@/lib/agents";
import { getTask, getLead, getCampaignV2, getSequence, getSettings, saveTaskDraft } from "@/lib/db";
import { resetUsage } from "@/lib/anthropic";
import { requireApiAuth } from "@/lib/authGuard";
import { apiHandler, ApiError } from "@/lib/apiHandler";

export const runtime = "nodejs";
export const maxDuration = 120;

// Draft the message for a sequence step task, personalized to the lead + the
// step's channel/intent. Stored on the task so it persists. Manual-send model:
// this only writes copy — the user still sends it.
export const POST = apiHandler(async (_req, { params }) => {
  const denied = await requireApiAuth();
  if (denied) return denied;

  const task = getTask(Number(params.id));
  if (!task) throw new ApiError("Task not found.", 404);
  if (task.step_index == null) throw new ApiError("This task isn't a cadence step.", 400);

  const lead = getLead(task.lead_id);
  if (!lead) throw new ApiError("Lead not found.", 404);
  if (lead.suppressed) throw new ApiError("This lead is marked do-not-contact.", 403);

  const campaign = getCampaignV2(task.campaign_id);
  const seq = campaign?.sequenceId ? getSequence(campaign.sequenceId) : null;
  if (!seq || !seq.steps[task.step_index]) throw new ApiError("Cadence step no longer exists.", 400);
  const step = seq.steps[task.step_index];
  const domain = (lead.module || campaign?.module) === "international" ? "international" : "local";

  resetUsage();
  const draft = await runWriteStep({
    domain, lead, step,
    stepIndex: task.step_index, totalSteps: seq.steps.length,
    profile: getSettings(), module: lead.module,
    campaignId: task.campaign_id, leadId: task.lead_id,
  });

  saveTaskDraft(task.id, draft);
  return NextResponse.json({ draft });
});
