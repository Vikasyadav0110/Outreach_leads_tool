"use client";

import { useEffect, useRef, useState } from "react";
import PipelineSteps from "@/app/components/PipelineSteps";
import LeadsTable from "@/app/components/LeadsTable";
import QualificationCards from "@/app/components/QualificationCards";
import MessageTabs from "@/app/components/MessageTabs";
import MeetingModal from "@/app/components/MeetingModal";
import ErrorAlert from "@/app/components/ErrorAlert";
import StatTile from "@/app/components/StatTile";
import AgentActivity from "@/app/components/AgentActivity";
import { LeadsTableSkeleton, CardsSkeleton } from "@/app/components/Skeleton";
import { fmtCost } from "@/app/components/format";

// Step indices: 0 find, 1 qualify, 2 write, 3 ready.
const AGENTS = [
  {
    idx: 0,
    key: "leads",
    endpoint: "/api/agents/find-leads",
    running: "Agent 1 is searching the web for real businesses…",
  },
  {
    idx: 1,
    key: "qualified",
    endpoint: "/api/agents/qualify",
    running: "Agent 2 is qualifying high-priority leads…",
  },
  {
    idx: 2,
    key: "messages",
    endpoint: "/api/agents/write-messages",
    running: "Agent 3 is writing emails, WhatsApp messages, and call scripts…",
  },
];

export default function CampaignRunner({ initialCampaign, autorun, mock }) {
  const [campaign, setCampaign] = useState(initialCampaign);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState(initialCampaign.error || "");
  const [failedStep, setFailedStep] = useState(-1);
  const [meetingLead, setMeetingLead] = useState(null);
  const startedRef = useRef(false);

  // Which agents have already produced output (for completedThrough).
  const completedThrough = (() => {
    if (campaign.messages) return 3;
    if (campaign.qualified) return 1; // through "qualify" step
    if (campaign.leads) return 0;
    return -1;
  })();

  async function callAgent(agent) {
    setError("");
    setFailedStep(-1);
    setActiveIndex(agent.idx);
    try {
      const res = await fetch(agent.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent failed.");
      // Re-fetch the full campaign so state stays in sync with SQLite.
      const refreshed = await fetch(`/api/campaigns/${campaign.id}`).then((r) =>
        r.json()
      );
      if (refreshed.campaign) setCampaign(refreshed.campaign);
      setActiveIndex(-1);
      return refreshed.campaign;
    } catch (e) {
      setError(e.message);
      setFailedStep(agent.idx);
      setActiveIndex(-1);
      return null;
    }
  }

  // Run the whole pipeline from a given starting agent index.
  async function runFrom(startIdx) {
    let current = campaign;
    for (const agent of AGENTS) {
      if (agent.idx < startIdx) continue;
      // Skip agents whose output already exists (resume).
      if (current && current[agent.key]) continue;
      const updated = await callAgent(agent);
      if (!updated) return; // stop on failure
      current = updated;
    }
  }

  // Auto-run on first mount if requested and the pipeline isn't complete. Starts
  // from the next unfinished step — so an AI campaign begins at lead discovery,
  // while a seeded "specific business" campaign (leads already present) resumes
  // straight into qualify → write.
  useEffect(() => {
    if (autorun && !startedRef.current && completedThrough < 3) {
      startedRef.current = true;
      runFrom(nextStep(campaign));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = activeIndex !== -1;
  const runningMsg =
    AGENTS.find((a) => a.idx === activeIndex)?.running || "Working…";

  const highCount = Array.isArray(campaign.leads)
    ? campaign.leads.filter((l) => l.priority === "HIGH").length
    : 0;
  const wonCount = Object.values(campaign.outcomes || {}).filter(
    (o) => o.status === "won"
  ).length;

  return (
    <div className="space-y-8">
      {mock && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">⚠️ Simulated data.</span> These leads,
          contacts, and messages are AI-generated placeholders — contact details
          are not real and Send actions are disabled. Add a valid
          <code className="mx-1 rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code>
          for live results.
        </div>
      )}

      {/* Pipeline indicator + controls */}
      <div className="card p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <PipelineSteps
            activeIndex={activeIndex}
            completedThrough={completedThrough}
          />
          <div className="flex items-center gap-2">
            {!running && completedThrough < 3 && (
              <button
                className="btn-primary"
                onClick={() => runFrom(nextStep(campaign))}
              >
                {completedThrough === -1 ? "Run Pipeline" : "Continue"}
              </button>
            )}
            {campaign.messages && (
              <a
                href={`/api/campaigns/${campaign.id}/export`}
                className="btn-ghost"
              >
                Download kit (.txt)
              </a>
            )}
          </div>
        </div>

        {running && (
          <div className="mt-5 rounded-lg bg-gradient-to-r from-accent/10 to-accent2/10 px-4 py-3">
            <div className="flex items-center gap-3 text-sm font-medium text-accent">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              {runningMsg}
            </div>
            <AgentActivity step={activeIndex} />
          </div>
        )}

        {error && (
          <div className="mt-5">
            <ErrorAlert
              message={error}
              onRetry={() => runFrom(failedStep)}
              retrying={running}
            />
          </div>
        )}
      </div>

      {/* Stat tiles */}
      {campaign.leads && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatTile label="Leads" value={campaign.leads.length} />
          <StatTile label="HIGH priority" value={highCount} valueClass="text-warning" />
          <StatTile label="Won" value={wonCount} valueClass="text-success" />
          <StatTile label={mock ? "Est. cost (sim)" : "Est. cost"} value={fmtCost(campaign.usage?.costUsd)} />
        </div>
      )}

      {/* Agent 1: loading skeleton */}
      {activeIndex === 0 && !campaign.leads && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">Finding leads…</h3>
          <LeadsTableSkeleton />
        </section>
      )}

      {/* Agent 1 results */}
      {campaign.leads && (
        <section className="section-enter space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              Leads ({campaign.leads.length})
            </h3>
            <span className="text-xs text-muted">
              {highCount} HIGH priority (score ≥ 7)
            </span>
          </div>
          <LeadsTable
            leads={campaign.leads}
            campaignId={campaign.id}
            initialOutcomes={campaign.outcomes}
            qualified={campaign.qualified}
            messages={campaign.messages}
            domain={campaign.domain}
            campaignCreatedAt={campaign.createdAt}
            mock={mock}
          />
        </section>
      )}

      {/* Agent 2: loading skeleton */}
      {activeIndex === 1 && !campaign.qualified && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">Qualifying leads…</h3>
          <CardsSkeleton />
        </section>
      )}

      {/* Agent 2 results */}
      {campaign.qualified && (
        <section className="section-enter space-y-3">
          <h3 className="text-sm font-semibold text-ink">
            Qualification cards ({campaign.qualified.length})
          </h3>
          <QualificationCards
            cards={campaign.qualified}
            mock={mock}
            onPrep={(card) => setMeetingLead(card)}
          />
        </section>
      )}

      {/* Agent 3: loading skeleton */}
      {activeIndex === 2 && !campaign.messages && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">Writing messages…</h3>
          <CardsSkeleton count={2} />
        </section>
      )}

      {/* Agent 3 results */}
      {campaign.messages && (
        <section className="section-enter space-y-3">
          <h3 className="text-sm font-semibold text-ink">
            Messages ({campaign.messages.length})
          </h3>
          <MessageTabs
            messages={campaign.messages}
            qualified={campaign.qualified}
            mock={mock}
          />
        </section>
      )}

      {meetingLead && (
        <MeetingModal
          domain={campaign.domain}
          lead={meetingLead}
          onClose={() => setMeetingLead(null)}
        />
      )}
    </div>
  );
}

// Next step to run, based on what's already in the campaign.
function nextStep(c) {
  if (!c.leads) return 0;
  if (!c.qualified) return 1;
  if (!c.messages) return 2;
  return 3;
}
