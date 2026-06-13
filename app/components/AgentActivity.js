"use client";

import { useEffect, useState } from "react";

// Phase labels per pipeline step. These advance on a cadence to give a live
// "what's happening" feel during a run. (Real per-event streaming of the
// web-search tool would require an SSE response from the agent route; this is
// the progressive-enhancement version that works with the current JSON routes.)
const PHASES = {
  0: [
    "Searching local directories",
    "Verifying the businesses exist",
    "Checking websites & social profiles",
    "Scoring digital-presence gaps",
    "Compiling the lead list",
  ],
  1: [
    "Researching decision-makers",
    "Finding public contact details",
    "Pinpointing the exact gap",
    "Writing qualification cards",
  ],
  2: [
    "Loading your sender profile",
    "Drafting cold emails",
    "Writing WhatsApp messages",
    "Building call scripts",
  ],
};

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function AgentActivity({ step }) {
  const phases = PHASES[step] || [];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
    if (phases.length === 0) return;
    const t = setInterval(
      () => setIdx((i) => Math.min(i + 1, phases.length - 1)),
      2500
    );
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (phases.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1.5">
      {phases.map((p, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <li
            key={p}
            className={`flex items-center gap-2 text-sm ${
              active ? "text-accent" : done ? "text-muted" : "text-neutral-300"
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center">
              {done ? (
                <CheckIcon />
              ) : active ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-200" />
              )}
            </span>
            {p}
            {active ? "…" : ""}
          </li>
        );
      })}
    </ul>
  );
}
