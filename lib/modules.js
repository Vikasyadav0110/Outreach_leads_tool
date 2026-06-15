// The app is split into two modules (separate businesses). Each maps to an
// existing sourced-leads pipeline. The active module is a view scope held in a
// non-secret cookie; server components read it, the sidebar switcher sets it.
//
// Client-safe: this file holds only plain constants/helpers (no next/headers),
// so client components (e.g. ModuleSwitcher) can import from it. The server-only
// getActiveModule() lives in lib/activeModule.js.

export const MODULE_COOKIE = "op_module";

export const MODULES = [
  {
    key: "local",
    label: "Local Clients",
    short: "Local",
    pipeline: "deliver",
    tone: "accent",
    blurb: "SMBs you fulfil yourself (websites, digital presence).",
  },
  {
    key: "international",
    label: "International SaaS",
    short: "International",
    pipeline: "sell",
    tone: "violet",
    blurb: "Enterprise projects you broker to your IT partners.",
  },
];

export const DEFAULT_MODULE = "local";

export function moduleMeta(key) {
  return MODULES.find((m) => m.key === key) || MODULES[0];
}

export function pipelineOf(key) {
  return moduleMeta(key).pipeline;
}
