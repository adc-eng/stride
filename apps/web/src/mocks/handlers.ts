import { http, HttpResponse } from "msw";
import type { Definition, Insight, LogEntry } from "../lib/api";

/* ---------------- seed definitions ---------------- */
// name + description are first-class: the nightly agent reasons over the
// descriptions, so they are written as real product data, not placeholders.

const MOODS = ["Energized", "Focused", "Calm", "Tired", "Stressed", "Meh"];

const inputs: Definition[] = [
  {
    id: "breathing",
    kind: "input",
    name: "Focussed Breathing",
    description:
      "A short deliberate breathing practice to down-regulate stress. Logged as done/not-done; duration optional.",
    valueType: "boolean",
    attributesSchema: { duration_min: "minutes spent, integer" },
  },
  {
    id: "stretches",
    kind: "input",
    name: "Stretches",
    description:
      "Light mobility or stretching. Logged as done/not-done; duration optional.",
    valueType: "boolean",
    attributesSchema: { duration_min: "minutes spent, integer" },
  },
  {
    id: "walking",
    kind: "input",
    name: "Walking",
    description:
      "A deliberate walk. Logged as done/not-done; optional duration and distance for richer trends.",
    valueType: "boolean",
    attributesSchema: {
      duration_min: "minutes walked, integer",
      distance_miles: "distance in miles, decimal",
    },
  },
  {
    id: "sleep",
    kind: "input",
    name: "Sleep",
    description:
      "A sleep period. Value is hours slept; bed time is the occurrence time. Repeatable — log naps or split sleep separately. Quality is a 1–5 self-rating.",
    valueType: "numeric",
    unit: "hours",
    timeRequired: true, // occurred_at (worded 'Bed time') is compulsory
    attributesSchema: { quality: "1 (poor) – 5 (great)" },
  },
  {
    id: "last_meal",
    kind: "input",
    name: "Last meal",
    description:
      "The day's final meal. Value is a 1–5 heaviness rating; the time it was eaten is compulsory (relevant to sleep and weight).",
    valueType: "numeric",
    unit: "scale_1_5",
    timeRequired: true,
    attributesSchema: {
      scale: "1 (lightest) – 5 (heaviest)",
      description: "free text, what it was",
    },
  },
  {
    id: "water",
    kind: "input",
    name: "Water intake",
    description:
      "Water drunk, in ounces. Quick-add buttons and a free-flow number both append here; the day's total is the sum of the day's entries.",
    valueType: "numeric",
    unit: "oz",
  },
  {
    id: "daily_vibe",
    kind: "input",
    name: "Daily vibe",
    description:
      "An end-of-day single attribution of overall state with a frequency (sometimes/often/most). Disabled in the demo — shown to illustrate the planned end-of-day summary path distinct from in-the-moment Mood.",
    valueType: "enum",
    enumOptions: MOODS,
    disabled: true,
    attributesSchema: { level: "sometimes | often | most" },
  },
];

const outcomes: Definition[] = [
  {
    id: "weight",
    kind: "outcome",
    name: "Weight",
    description:
      "Body weight in pounds. Observed and logged neutrally — descriptive, never a target to beat.",
    valueType: "numeric",
    unit: "lbs",
  },
  {
    id: "mood",
    kind: "outcome",
    name: "Mood",
    description:
      "In-the-moment felt state, tapped anytime through the day (logged as 'now'). Density of taps is later collated into a daily view — the user does not hand-enter frequency here.",
    valueType: "enum",
    enumOptions: MOODS,
    attributesSchema: { at: "always 'now' for in-moment taps" },
  },
];

const defsById = new Map<string, Definition>(
  [...inputs, ...outcomes].map((d) => [d.id, d])
);

/* ---------------- in-memory log store ---------------- */

let logs: LogEntry[] = [];
// In the real backend user_id comes from the verified token, never the body.
// The mock is single-user; this constant stands in so every row carries the
// field and the mock predicts the real contract's shape.
const MOCK_USER_ID = "user_mock_1";
let seq = 1;
const nextId = (p: string) => `${p}_${seq++}`;

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// occurred_at rule: the client normally sends page-date + time. If a POST omits
// occurred_at, fall back to logged_at's clock time when the target date is today,
// else noon of that date (backfill of a past day — "now" is meaningless there).
function resolveOccurredAt(
  provided: string | undefined,
  loggedAt: string
): string {
  if (provided) return provided;
  const today = todayISODate();
  // no date context on a bare POST → assume today, use now
  return today === loggedAt.slice(0, 10)
    ? loggedAt
    : `${today}T12:00:00.000Z`;
}

function seedSomeHistory() {
  // 14 days of history across every entity so the Dashboard charts look real.
  // The mock returns RAW logs; the dashboard summarizes them client-side.
  const days = 14;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const round = (n: number, p = 1) => +n.toFixed(p);

  for (let d = days; d >= 1; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    // Local-time ISO (no trailing Z). The dashboard reads occurred_at with
    // getHours()/getMinutes() (local), so seeding in local time makes the
    // charted hour equal the seeded hour. A trailing Z would shift everything
    // by the viewer's UTC offset and throw the time axes off.
    const at = (h: number, m = 0) => {
      const dd = new Date(date);
      dd.setHours(h, m, 0, 0);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(
        dd.getDate()
      )}T${pad(dd.getHours())}:${pad(dd.getMinutes())}:00`;
    };

    // outcome: weight — slow gentle drift
    logs.push({
      id: nextId("log"),
      user_id: MOCK_USER_ID,
      definitionId: "weight",
      kind: "outcome",
      value: round(181 - d * 0.05 + rnd(-0.6, 0.6)),
      occurred_at: at(7, 30),
      logged_at: at(7, 31),
      attributes: { unit: "lbs" },
    });

    // input: sleep — hours + quality + bed time (occurred_at).
    // Bed time clusters late evening into the small hours: 21:00–01:00.
    const bedHour = [21, 22, 22, 23, 23, 0, 1][Math.floor(rnd(0, 7))];
    logs.push({
      id: nextId("log"),
      user_id: MOCK_USER_ID,
      definitionId: "sleep",
      kind: "input",
      value: round(rnd(6, 8.5), 2),
      occurred_at: at(bedHour, Math.floor(rnd(0, 59))),
      logged_at: at(23, 5),
      attributes: { quality: Math.round(rnd(2, 5)) },
    });

    // input: last meal — heaviness 1-5, time is occurred_at. Evening to late
    // evening: 18:00–21:30.
    const mealHour = [18, 18, 19, 19, 20, 20, 21][Math.floor(rnd(0, 7))];
    logs.push({
      id: nextId("log"),
      user_id: MOCK_USER_ID,
      definitionId: "last_meal",
      kind: "input",
      value: Math.round(rnd(1, 5)),
      occurred_at: at(mealHour, Math.floor(rnd(0, 30))),
      logged_at: at(21, 45),
      attributes: { scale: "1-5" },
    });

    // input: water — a few adds through the day, summed at read time
    const adds = Math.floor(rnd(3, 7));
    for (let i = 0; i < adds; i++) {
      logs.push({
        id: nextId("log"),
        user_id: MOCK_USER_ID,
        definitionId: "water",
        kind: "input",
        value: [4, 8, 16, 24][Math.floor(rnd(0, 4))],
        occurred_at: at(8 + i * 2, 0),
        logged_at: at(8 + i * 2, 1),
        attributes: { unit: "oz" },
      });
    }

    // inputs: breathing + stretches — binary done; duration is always 5 min.
    if (Math.random() < 0.75)
      logs.push({
        id: nextId("log"),
        user_id: MOCK_USER_ID,
        definitionId: "breathing",
        kind: "input",
        value: true,
        occurred_at: at(7, 0),
        logged_at: at(7, 1),
        attributes: { duration_min: 5 },
      });
    if (Math.random() < 0.6)
      logs.push({
        id: nextId("log"),
        user_id: MOCK_USER_ID,
        definitionId: "stretches",
        kind: "input",
        value: true,
        occurred_at: at(7, 15),
        logged_at: at(7, 16),
        attributes: { duration_min: 5 },
      });
    if (Math.random() < 0.7)
      logs.push({
        id: nextId("log"),
        user_id: MOCK_USER_ID,
        definitionId: "walking",
        kind: "input",
        value: true,
        occurred_at: at(18, 0),
        logged_at: at(18, 1),
        attributes: {
          duration_min: Math.round(rnd(15, 55)),
          distance_miles: round(rnd(0.8, 3.2), 1),
        },
      });

    // input: daily_vibe — one attribution per day, 6 vibe types + level.
    // Charted greyed on the dashboard (mock returns it though it's disabled for entry).
    const VIBES = ["Energized", "Focused", "Calm", "Tired", "Stressed", "Meh"];
    logs.push({
      id: nextId("log"),
      user_id: MOCK_USER_ID,
      definitionId: "daily_vibe",
      kind: "input",
      value: VIBES[Math.floor(rnd(0, VIBES.length))],
      occurred_at: at(21, 0),
      logged_at: at(21, 1),
      attributes: { level: ["sometimes", "often", "most"][Math.floor(rnd(0, 3))] },
    });
  }
}
seedSomeHistory();

/* ---------------- helpers ---------------- */

function filterLogs(
  all: LogEntry[],
  opts: { definitionId?: string; kind?: string; range?: string; date?: string }
): LogEntry[] {
  let out = all;
  if (opts.definitionId)
    out = out.filter((l) => l.definitionId === opts.definitionId);
  if (opts.kind) out = out.filter((l) => l.kind === opts.kind);
  if (opts.date)
    out = out.filter((l) => l.occurred_at.slice(0, 10) === opts.date);
  if (opts.range) {
    const m = /^(\d+)d$/.exec(opts.range);
    if (m) {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(m[1], 10));
      out = out.filter((l) => new Date(l.occurred_at) >= since);
    }
  }
  return [...out].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

async function appendLog(
  kind: "input" | "outcome",
  definitionId: string,
  body: any
): Promise<LogEntry | Response> {
  const def = defsById.get(definitionId);
  if (!def || def.kind !== kind)
    return HttpResponse.json({ error: "unknown definition" }, { status: 404 });
  if (def.disabled)
    return HttpResponse.json(
      { error: "definition disabled in demo" },
      { status: 409 }
    );
  const logged_at = new Date().toISOString();
  const entry: LogEntry = {
    id: nextId("log"),
    user_id: MOCK_USER_ID,
    definitionId,
    kind,
    value: body?.value ?? null,
    occurred_at: resolveOccurredAt(body?.occurred_at, logged_at),
    logged_at,
    attributes: body?.attributes,
  };
  logs.push(entry);
  return entry;
}

/* ---------------- handlers ---------------- */

export const handlers = [
  http.get("/api/inputs", () => HttpResponse.json(inputs)),
  http.get("/api/outcomes", () => HttpResponse.json(outcomes)),

  // union read: GET /logs?type=input|outcome&date=&range=
  http.get("/api/logs", ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? undefined;
    return HttpResponse.json(
      filterLogs(logs, {
        kind: type ?? undefined,
        date: url.searchParams.get("date") ?? undefined,
        range: url.searchParams.get("range") ?? undefined,
      })
    );
  }),

  // per-definition reads/writes
  http.get("/api/inputs/:id/logs", ({ params, request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(
      filterLogs(logs, {
        definitionId: params.id as string,
        date: url.searchParams.get("date") ?? undefined,
        range: url.searchParams.get("range") ?? undefined,
      })
    );
  }),
  http.get("/api/outcomes/:id/logs", ({ params, request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(
      filterLogs(logs, {
        definitionId: params.id as string,
        date: url.searchParams.get("date") ?? undefined,
        range: url.searchParams.get("range") ?? undefined,
      })
    );
  }),

  http.post("/api/inputs/:id/logs", async ({ params, request }) => {
    const body = await request.json().catch(() => ({}));
    const r = await appendLog("input", params.id as string, body);
    return r instanceof Response ? r : HttpResponse.json(r, { status: 201 });
  }),
  http.post("/api/outcomes/:id/logs", async ({ params, request }) => {
    const body = await request.json().catch(() => ({}));
    const r = await appendLog("outcome", params.id as string, body);
    return r instanceof Response ? r : HttpResponse.json(r, { status: 201 });
  }),

  http.delete("/api/inputs/:id/logs/:logId", ({ params }) => {
    logs = logs.filter((l) => l.id !== params.logId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.delete("/api/outcomes/:id/logs/:logId", ({ params }) => {
    logs = logs.filter((l) => l.id !== params.logId);
    return new HttpResponse(null, { status: 204 });
  }),

  // derived, cross-entity — GET returns last N stored insights, newest first
  http.get("/api/insights", ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);
    const sorted = [...insightStore].sort((a, b) =>
      b.generated_at.localeCompare(a.generated_at)
    );
    return HttpResponse.json(sorted.slice(0, limit));
  }),

  // POST /insights/generate { from?, to? } — runs the mocked reasoning over
  // logs in range, PERSISTS the resulting rows, returns them. Range-aware and
  // deliberately hedged: it counts the logs actually in range and, when data
  // is thin, returns a single honest "nothing useful yet" insight rather than
  // manufacturing correlations.
  http.post("/api/insights/generate", async ({ request }) => {
    const { from, to } = (await request.json().catch(() => ({}))) as {
      from?: string | null;
      to?: string | null;
    };
    const generated = generateInsights(from ?? null, to ?? null);
    insightStore.push(...generated);
    return HttpResponse.json(generated, { status: 201 });
  }),

  // interactive chat — range-scoped, NOT persisted. Reads the question + the
  // range so the reply can acknowledge the data context.
  http.post("/api/chat", async ({ request }) => {
    const { question, from, to } = (await request.json().catch(() => ({}))) as {
      question?: string;
      from?: string | null;
      to?: string | null;
    };
    const q = (question ?? "").trim();
    const n = countLogsInRange(from ?? null, to ?? null).total;
    const scope = rangeLabel(from ?? null, to ?? null);
    const reply =
      q.length === 0
        ? "Ask me something specific about your logged data — for example, how your sleep relates to your evening meals."
        : `Looking at ${scope} (${n} logs): ${q.replace(
            /\?+$/,
            ""
          )} — a few of your logged patterns look relevant, though I'd hold this loosely. This is a tentative reading of your sketches, framed as a hypothesis rather than proven cause. (Demo reply — the real agent will ground each claim in the specific numbers.)`;
    return HttpResponse.json({ reply });
  }),

  // raw capture
  http.post("/api/captures", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      raw_text?: string;
    };
    return HttpResponse.json(
      { id: nextId("cap"), raw_text: body?.raw_text ?? "" },
      { status: 201 }
    );
  }),
];

/* ---------------- insight store + mocked generator ---------------- */

const insightStore: Insight[] = [];

function rangeLabel(from: string | null, to: string | null): string {
  if (!from && !to) return "all logged days";
  const f = from ?? "the beginning";
  const t = to ?? "today";
  return `${f} – ${t}`;
}

// count logs whose occurred_at date falls within [from, to] (inclusive).
function countLogsInRange(from: string | null, to: string | null) {
  const inRange = logs.filter((l) => {
    const d = l.occurred_at.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
  const entities = new Set(inRange.map((l) => l.definitionId));
  return { total: inRange.length, entityCount: entities.size, inRange };
}

const GENERATED_BY = "claude-mock-v0";

// Produces 0..N stored insight rows for a range. Mirrors the intended real
// behavior: hedged, entity-cited, and — when data is thin — a single honest
// "no useful insight yet" card rather than invented correlations.
function generateInsights(from: string | null, to: string | null): Insight[] {
  const now = new Date().toISOString();
  const { total, entityCount, inRange } = countLogsInRange(from, to);
  const base = {
    user_id: MOCK_USER_ID,
    generated_at: now,
    range_from: from,
    range_to: to,
    generated_by: GENERATED_BY,
  };

  // thin data → one honest non-insight (nudges toward chat)
  if (total < 12 || entityCount < 3) {
    return [
      {
        ...base,
        id: nextId("ins"),
        title: "Not enough to say yet",
        body: `Over ${rangeLabel(
          from,
          to
        )} there are only ${total} logs across ${entityCount} ${
          entityCount === 1 ? "entity" : "entities"
        } — too sparse to draw anything trustworthy. Log a bit more, or ask me something specific in the chat below.`,
        confidence: "low",
        entityIds: [],
      },
    ];
  }

  // count a couple of signals actually present in range so the text is grounded
  const has = (id: string) => inRange.some((l) => l.definitionId === id);
  const out: Insight[] = [];

  if (has("last_meal") && has("sleep")) {
    out.push({
      ...base,
      id: nextId("ins"),
      title: "Later meals, shorter sleep",
      body: `Across ${rangeLabel(
        from,
        to
      )}, nights following a later last-meal time tended to show fewer hours slept. A weak association over ${total} logs — a hypothesis to watch, not proven cause.`,
      confidence: "low",
      entityIds: ["last_meal", "sleep"],
    });
  }

  if (has("walking") && has("sleep")) {
    out.push({
      ...base,
      id: nextId("ins"),
      title: "Walking days, steadier sleep",
      body: `Days with a logged walk more often preceded a full night's sleep in this window. Encouraging as a pattern to keep observing; the sample is still modest.`,
      confidence: "medium",
      entityIds: ["walking", "sleep"],
    });
  }

  if (has("weight")) {
    out.push({
      ...base,
      id: nextId("ins"),
      title: "Weight trend is gentle",
      body: `Weight over ${rangeLabel(
        from,
        to
      )} drifts only slightly — well within normal day-to-day variation. Nothing to act on; shown descriptively.`,
      confidence: "medium",
      entityIds: ["weight"],
    });
  }

  // guarantee at least one card even if the has() checks all missed
  if (out.length === 0) {
    out.push({
      ...base,
      id: nextId("ins"),
      title: "Patterns are still forming",
      body: `There are ${total} logs across ${entityCount} entities in ${rangeLabel(
        from,
        to
      )}, but no single relationship stands out yet. Ask me something specific in the chat below.`,
      confidence: "low",
      entityIds: [],
    });
  }

  return out;
}

// Seed a couple of prior insights so the tab isn't empty on first load.
(function seedInsights() {
  const mk = (
    daysAgo: number,
    partial: Omit<
      Insight,
      "user_id" | "generated_at" | "range_from" | "range_to" | "generated_by"
    >
  ): Insight => {
    const g = new Date();
    g.setDate(g.getDate() - daysAgo);
    const to = g.toISOString().slice(0, 10);
    const fromD = new Date(g);
    fromD.setDate(fromD.getDate() - 14);
    return {
      ...partial,
      user_id: MOCK_USER_ID,
      generated_at: g.toISOString(),
      range_from: fromD.toISOString().slice(0, 10),
      range_to: to,
      generated_by: GENERATED_BY,
    };
  };
  insightStore.push(
    mk(2, {
      id: nextId("ins"),
      title: "Later meals, shorter sleep",
      body: "Over the prior two weeks, later last-meal times tended to precede fewer hours slept. A weak association, framed as a hypothesis rather than proven cause.",
      confidence: "low",
      entityIds: ["last_meal", "sleep"],
    }),
    mk(2, {
      id: nextId("ins"),
      title: "Walking days, steadier sleep",
      body: "Days with a logged walk more often preceded a full night's sleep. Encouraging as a pattern to keep observing.",
      confidence: "medium",
      entityIds: ["walking", "sleep"],
    })
  );
})();
