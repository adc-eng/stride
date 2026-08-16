// The ONLY file that knows about the network. Client-side fetch only, so MSW's
// browser worker always intercepts in dev. Going live = change BASE, stop the
// worker. Call sites don't change.
//
// Contract is resource-oriented and time-series:
//   /inputs, /outcomes           definitions (the things tracked)
//   /inputs/{id}/logs            append/read a definition's log entries
//   /outcomes/{id}/logs
//   /logs?type=input|outcome     union read across definitions of a type
//   /insights                    cross-entity nightly agent output
//   /captures                    immutable raw text (voice/note proxy)
//
// Every log carries occurred_at (when it happened, = page-date + time) and
// logged_at (server wall-clock when written). occurred_at is what the agent and
// charts key off; logged_at is for audit/backfill provenance.

export type EntityKind = "input" | "outcome";

export type ValueType =
  | "boolean" // done / not-done
  | "numeric" // weight, hours, water oz, 1-5 scales
  | "time" // HH:MM time-of-day
  | "enum"; // mood

// A tracked thing. name + description are first-class (the agent reasons over
// description). attributesSchema documents what may live in a log's attributes.
export type Definition = {
  id: string;
  kind: EntityKind;
  name: string;
  description: string;
  valueType: ValueType;
  unit?: string;
  timeRequired?: boolean; // occurred_at time is compulsory (Sleep, Last meal)
  enumOptions?: string[]; // for valueType "enum"
  disabled?: boolean; // shown but not loggable in the demo (daily_vibe)
  attributesSchema?: Record<string, string>;
};

export type LogEntry = {
  id: string;
  user_id: string; // from the verified token in the real backend
  definitionId: string;
  kind: EntityKind;
  value: number | boolean | string | null;
  occurred_at: string; // ISO 8601
  logged_at: string; // ISO 8601
  attributes?: Record<string, unknown>;
};

export type NewLog = {
  value?: number | boolean | string | null;
  occurred_at?: string; // omitted → server default (see mock rules)
  attributes?: Record<string, unknown>;
};

export type Insight = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  confidence: "low" | "medium" | "high";
  entityIds: string[];
  // provenance — every generated insight is a stored row
  generated_at: string; // ISO
  range_from: string | null; // YYYY-MM-DD, null = all time
  range_to: string | null;
  generated_by: string; // LLM identifier, e.g. "claude-mock-v0"
};

export type GenerateParams = { from?: string | null; to?: string | null };

const BASE = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  // --- definitions ---
  listInputs: () => fetch(`${BASE}/inputs`).then(json<Definition[]>),
  listOutcomes: () => fetch(`${BASE}/outcomes`).then(json<Definition[]>),

  // --- logs, per definition ---
  listLogs: (
    kind: EntityKind,
    id: string,
    params?: { range?: string; date?: string }
  ) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    const base = kind === "input" ? "inputs" : "outcomes";
    return fetch(`${BASE}/${base}/${id}/logs${q ? `?${q}` : ""}`).then(
      json<LogEntry[]>
    );
  },

  addLog: (kind: EntityKind, id: string, body: NewLog) => {
    const base = kind === "input" ? "inputs" : "outcomes";
    return fetch(`${BASE}/${base}/${id}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json<LogEntry>);
  },

  deleteLog: (kind: EntityKind, id: string, logId: string) => {
    const base = kind === "input" ? "inputs" : "outcomes";
    return fetch(`${BASE}/${base}/${id}/logs/${logId}`, {
      method: "DELETE",
    }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    });
  },

  // --- union read across a type (GET /logs?type=input&date=...) ---
  listAllLogs: (kind: EntityKind, params?: { range?: string; date?: string }) => {
    const q = new URLSearchParams({
      type: kind,
      ...(params ?? {}),
    } as Record<string, string>);
    return fetch(`${BASE}/logs?${q.toString()}`).then(json<LogEntry[]>);
  },

  // --- derived ---
  // last N generated insights, newest first
  listInsights: (limit = 10) =>
    fetch(`${BASE}/insights?limit=${limit}`).then(json<Insight[]>),

  // run the (mocked) reasoning over logs in range, persist + return new rows
  generateInsights: (params: GenerateParams = {}) =>
    fetch(`${BASE}/insights/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }).then(json<Insight[]>),

  // interactive chat — range-scoped, NOT persisted as insights
  chat: (question: string, params: GenerateParams = {}) =>
    fetch(`${BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, ...params }),
    }).then(json<{ reply: string }>),

  // --- raw capture (voice/note proxy) ---
  addCapture: (raw_text: string, source = "note") =>
    fetch(`${BASE}/captures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text, source }),
    }).then(json<{ id: string }>),
};
