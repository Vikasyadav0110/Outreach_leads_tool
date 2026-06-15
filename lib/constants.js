// Central constants — replaces scattered magic strings. Client-safe (no imports),
// so both server and client code can use these. Status/task-id values must match
// what's already persisted in the DB; don't rename values, only reference them.

// Campaign lifecycle (campaigns.status).
export const CAMPAIGN_STATUS = {
  NEW: "new",
  FINDING: "finding",
  FOUND: "found",
  QUALIFYING: "qualifying",
  QUALIFIED: "qualified",
  WRITING: "writing",
  READY: "ready",
  FAILED: "failed",
};

// Follow-up task kinds (tasks.kind).
export const TASK_KIND = {
  FOLLOW_UP: "follow_up",
  CALL: "call",
  CUSTOM: "custom",
};

// Default days until an auto-scheduled follow-up is due.
export const DEFAULT_FOLLOWUP_DAYS = 3;

// Cookie names used across server + client.
export const COOKIES = {
  SESSION: "op_session",
  MODULE: "op_module",
};

// Header the edge middleware injects so server components can read the path.
export const PATHNAME_HEADER = "x-pathname";
