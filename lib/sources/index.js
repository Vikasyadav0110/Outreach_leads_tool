// Registry of source adapters. Add a new file here to plug in a new source —
// each declares which pipeline ('deliver' | 'sell') it feeds, so the two tasks
// (handle SMBs yourself vs. sell enterprise leads) stay cleanly separated.
import claudeResearch from "./claudeResearch";
import googlePlaces from "./googlePlaces";
import openStreetMap from "./openStreetMap";
import remoteok from "./remoteok";
// Enterprise (sell-pipeline) sources. Each ships a real API path gated behind
// its key + a mock fallback, so the International module is demoable now and goes
// live per-provider as keys are added. Recommended first key: APOLLO_API_KEY.
// Claude Research needs no new key (uses ANTHROPIC_API_KEY) — listed first.
import apollo from "./apollo";
import crunchbase from "./crunchbase";
import builtwith from "./builtwith";
import jobBoards from "./jobBoards";
import marketplaces from "./marketplaces";
// "Enterprise buyers" sources — orgs that OUTSOURCE projects (awards + open RFPs).
import usaSpending from "./usaSpending";
import samGov from "./samGov";

export const ADAPTERS = [claudeResearch, usaSpending, samGov, googlePlaces, openStreetMap, apollo, crunchbase, builtwith, jobBoards, remoteok, marketplaces];

export function getAdapter(id) {
  return ADAPTERS.find((a) => a.id === id) || null;
}

// Plain, client-safe descriptors (no functions) for rendering the picker.
export function listAdapters() {
  return ADAPTERS.map((a) => ({
    id: a.id,
    label: a.label,
    pipeline: a.pipeline,
    universal: a.universal || false,
    description: a.description,
    requiresKey: a.requiresKey,
    ready: a.ready(),
  }));
}
