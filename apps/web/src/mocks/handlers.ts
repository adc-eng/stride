import { http, HttpResponse } from "msw";
import type { Definition, GenerateResult, Insight, LogEntry } from "../lib/api";
import {
  MOODS,
  VIBE_LEVELS,
  VIBE_LEVEL_LABEL,
  type VibeLevel,
  moodCountsToVibeAttributes,
} from "../lib/vibe";
import {
  generateInsightsFromAnthropic,
  promptInstructions,
  toolSchemaDisplay,
  normalizeEntityId,
} from "../lib/anthropic";

/* ---------------- seed definitions ---------------- */
// name + description are first-class: the agent reasons over the
// descriptions, so they are written as real product data, not placeholders.

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
      "An end-of-day attribution of overall state across all six mood labels, each with its own frequency (none / sometimes / often / a lot). Computed automatically from the day's Mood taps — not directly loggable in the demo. (Manual entry and free-text/voice-derived vibe are on the roadmap; deferred for now.)",
    valueType: "enum",
    enumOptions: MOODS,
    disabled: true, // still not directly POST-able by the user; only the mood-tap recompute writes it
    attributesSchema: {
      Energized: "none | sometimes | often | alot",
      Focused: "none | sometimes | often | alot",
      Calm: "none | sometimes | often | alot",
      Tired: "none | sometimes | often | alot",
      Stressed: "none | sometimes | often | alot",
      Meh: "none | sometimes | often | alot",
    },
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
      "In-the-moment felt state, tapped anytime through the day (logged as 'now'). Density of taps is collated into Daily vibe automatically.",
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

// Local-date basis throughout (matches the seed's local-time convention —
// see PROJECT_OVERVIEW "occurred_at timezone"). Using toISOString() here
// would compute a UTC calendar date, which can differ from the local one
// for part of every day depending on timezone — that mismatch was silently
// routing live writes (e.g. a Mood tap) to a different date bucket than the
// seed's "today" (day 60), so the Dashboard never showed the update.
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function localISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function nowLocalISO(): string {
  const d = new Date();
  return `${localISODate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
    d.getSeconds()
  )}`;
}
function todayISODate(): string {
  return localISODate();
}

// occurred_at rule: the client normally sends page-date + time. If a POST omits
// occurred_at it means "log this now" (Mood taps, Water quick-add) — resolve
// to the current local moment, same basis as everything else.
function resolveOccurredAt(
  provided: string | undefined,
  _loggedAt: string
): string {
  if (provided) return provided;
  return nowLocalISO();
}

// Seeded PRNG (mulberry32) so the 60-day mock dataset is reproducible across
// reloads — same arc shapes, same noise, every run. Only used for seed
// generation; live user actions (Mood taps, etc.) aren't randomized.
function mulberry32(seed: number) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED_RANDOM = mulberry32(20260817); // fixed seed — change to reshuffle the demo data

const rnd = (a: number, b: number) => a + SEED_RANDOM() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const round = (n: number, p = 1) => +n.toFixed(p);

// Local-time ISO (no trailing Z) — the dashboard reads occurred_at with
// getHours()/getMinutes() (local), so seeding in local time keeps charted
// hours equal to seeded hours. dayIndex: 1..60, 60 = today.
function dateForDayIndex(dayIndex: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - (60 - dayIndex));
  return d;
}
function atOnDay(dayIndex: number, h: number, m = 0): string {
  const dd = dateForDayIndex(dayIndex);
  dd.setHours(h, m, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(
    dd.getDate()
  )}T${pad(dd.getHours())}:${pad(dd.getMinutes())}:00`;
}
function isoDateForDayIndex(dayIndex: number): string {
  const dd = dateForDayIndex(dayIndex);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`;
}

/* ---------------- mood → daily_vibe derivation ---------------- */
// tapCountToLevel / moodCountsToVibeAttributes now live in ../lib/vibe
// (shared with the Today Mood buttons and the Dashboard vibe chart).

// Recomputes and upserts (replace-if-exists) the single daily_vibe row for a
// given calendar date, from that date's actual Mood outcome log rows. Used by
// both the historical seed and by live Mood taps on Today, so it's one
// mechanism end to end (a live app would run the same function server-side).
function upsertDailyVibeForDate(date: string) {
  const moodLogsThatDay = logs.filter(
    (l) => l.definitionId === "mood" && l.occurred_at.slice(0, 10) === date
  );
  const counts: Record<string, number> = {};
  for (const l of moodLogsThatDay) {
    const label = String(l.value);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  const attributes = moodCountsToVibeAttributes(counts);

  const existingIdx = logs.findIndex(
    (l) => l.definitionId === "daily_vibe" && l.occurred_at.slice(0, 10) === date
  );
  const entry: LogEntry = {
    id: existingIdx >= 0 ? logs[existingIdx].id : nextId("log"),
    user_id: MOCK_USER_ID,
    definitionId: "daily_vibe",
    kind: "input",
    value: null,
    occurred_at: `${date}T21:30:00`,
    logged_at: new Date().toISOString(),
    attributes,
  };
  if (existingIdx >= 0) logs[existingIdx] = entry;
  else logs.push(entry);
}

/* ---------------- 60-day arc-based seed ----------------
   dayIndex 1..60, 60 = today. Three independent narrative arcs, kept apart in
   the calendar so no single insight is confounded by two overlapping stories:

   - Days 12 & 40: low-sleep events. Day 12 is CUSHIONED (breathing/walking
     stay steady through days 10-14, skipping only day 13) -> mild, brief
     tiredness bump, days 13-16, fast recovery. Day 40 is UNPROTECTED
     (breathing/walking already lapsed days 33-48) -> elevated Tired/Meh,
     days 41-48, intermittent through ~day 48.
   - Days 20-29: a late-meal stretch, fully clear of the sleep events.
     Weight rises from day 22, peaks ~day 28, decays back by day 32.
   - Days 33-48: breathing/walking completion lapse (the "unprotected"
     condition for the day-40 sleep event above).
   - Days 49-60: everything back to baseline; day 60 (today) is clean.
------------------------------------------------------------------------- */

function sleepHoursFor(day: number): number {
  if (day === 12) return 3;
  if (day === 40) return 2;
  return round(rnd(6, 8.3), 2);
}

function lateMealWindow(day: number): boolean {
  return day >= 20 && day <= 29;
}

function weightBumpFor(day: number): number {
  const riseStart = 22,
    peak = 28,
    decayEnd = 32;
  if (day < riseStart || day > decayEnd) return 0;
  if (day <= peak) return 2.6 * ((day - riseStart) / (peak - riseStart));
  return 2.6 * (1 - (day - peak) / (decayEnd - peak));
}

// breathing/walking completion: high baseline, deliberately steady around the
// cushioned day-12 event (skip only day 13), lapsed days 33-48.
function movementActiveFor(day: number): boolean {
  if (day >= 33 && day <= 48) return SEED_RANDOM() < 0.12; // lapse
  if (day === 13) return false; // "not the day after" — explicit skip
  if (day >= 10 && day <= 14) return SEED_RANDOM() < 0.92; // cushion window
  return SEED_RANDOM() < 0.78; // baseline
}

// Mood tap counts per label for a given day — drives both the seeded Mood
// outcome logs and (via the same moodCountsToVibeAttributes fn used live)
// that day's daily_vibe.
function moodTapCountsFor(day: number): Record<string, number> {
  const mildBump = day >= 13 && day <= 16; // cushioned dip, fast recovery
  const severeUnprotected = day >= 41 && day <= 48; // unprotected, sustained
  const fadingTail = day >= 49 && day <= 51; // brief intermittent tail-off

  if (severeUnprotected) {
    return {
      Energized: randInt(0, 0),
      Focused: randInt(0, 1),
      Calm: randInt(0, 1),
      Tired: randInt(3, 5),
      Stressed: randInt(1, 2),
      Meh: randInt(2, 4),
    };
  }
  if (fadingTail && SEED_RANDOM() < 0.5) {
    return {
      Energized: randInt(0, 1),
      Focused: randInt(0, 1),
      Calm: randInt(0, 1),
      Tired: randInt(1, 2),
      Stressed: randInt(0, 1),
      Meh: randInt(1, 2),
    };
  }
  if (mildBump) {
    return {
      Energized: randInt(0, 1),
      Focused: randInt(0, 1),
      Calm: randInt(0, 1),
      Tired: randInt(2, 3),
      Stressed: randInt(0, 1),
      Meh: randInt(1, 2),
    };
  }
  // baseline
  return {
    Energized: randInt(0, 2),
    Focused: randInt(0, 2),
    Calm: randInt(0, 2),
    Tired: randInt(0, 1),
    Stressed: randInt(0, 1),
    Meh: randInt(0, 1),
  };
}

function seedSixtyDayHistory() {
  for (let day = 1; day <= 60; day++) {
    const date = isoDateForDayIndex(day);

    // outcome: weight — gentle baseline drift + the late-meal-linked bump
    logs.push({
      id: nextId("log"),
      user_id: MOCK_USER_ID,
      definitionId: "weight",
      kind: "outcome",
      value: round(180 - day * 0.02 + weightBumpFor(day) + rnd(-0.4, 0.4)),
      occurred_at: atOnDay(day, 7, 30),
      logged_at: atOnDay(day, 7, 31),
      attributes: { unit: "lbs" },
    });

    // input: sleep — baseline, with the two scripted low-sleep days
    const bedHour = [21, 22, 22, 23, 23, 0, 1][randInt(0, 6)];
    logs.push({
      id: nextId("log"),
      user_id: MOCK_USER_ID,
      definitionId: "sleep",
      kind: "input",
      value: sleepHoursFor(day),
      occurred_at: atOnDay(day, bedHour, randInt(0, 59)),
      logged_at: atOnDay(day, 23, 5),
      attributes: { quality: sleepHoursFor(day) <= 4 ? 1 : randInt(3, 5) },
    });

    // input: last meal — later window during the late-meal stretch
    const mealHour = lateMealWindow(day)
      ? [21, 21, 22, 22, 23][randInt(0, 4)]
      : [18, 18, 19, 19, 20, 20, 21][randInt(0, 6)];
    logs.push({
      id: nextId("log"),
      user_id: MOCK_USER_ID,
      definitionId: "last_meal",
      kind: "input",
      value: randInt(1, 5),
      occurred_at: atOnDay(day, mealHour, randInt(0, 30)),
      logged_at: atOnDay(day, 21, 45),
      attributes: { scale: "1-5" },
    });

    // input: water — a few adds through the day, summed at read time
    const adds = randInt(3, 6);
    for (let i = 0; i < adds; i++) {
      logs.push({
        id: nextId("log"),
        user_id: MOCK_USER_ID,
        definitionId: "water",
        kind: "input",
        value: [4, 8, 16, 24][randInt(0, 3)],
        occurred_at: atOnDay(day, 8 + i * 2, 0),
        logged_at: atOnDay(day, 8 + i * 2, 1),
        attributes: { unit: "oz" },
      });
    }

    // inputs: breathing + stretches + walking — arc-driven completion
    if (movementActiveFor(day))
      logs.push({
        id: nextId("log"),
        user_id: MOCK_USER_ID,
        definitionId: "breathing",
        kind: "input",
        value: true,
        occurred_at: atOnDay(day, 7, 0),
        logged_at: atOnDay(day, 7, 1),
        attributes: { duration_min: 5 },
      });
    if (SEED_RANDOM() < 0.6)
      logs.push({
        id: nextId("log"),
        user_id: MOCK_USER_ID,
        definitionId: "stretches",
        kind: "input",
        value: true,
        occurred_at: atOnDay(day, 7, 15),
        logged_at: atOnDay(day, 7, 16),
        attributes: { duration_min: 5 },
      });
    if (movementActiveFor(day))
      logs.push({
        id: nextId("log"),
        user_id: MOCK_USER_ID,
        definitionId: "walking",
        kind: "input",
        value: true,
        occurred_at: atOnDay(day, 18, 0),
        logged_at: atOnDay(day, 18, 1),
        attributes: {
          duration_min: randInt(15, 55),
          distance_miles: round(rnd(0.8, 3.2), 1),
        },
      });

    // outcome: mood — arc-driven tap counts, materialized as individual taps.
    // Today (day 60) is skipped: it's the live, interactively-entered day —
    // Mood should start empty so tapping on Today is what drives it, not a
    // pre-seeded random count.
    const counts = day < 60 ? moodTapCountsFor(day) : {};
    for (const label of MOODS) {
      const n = counts[label] ?? 0;
      for (let i = 0; i < n; i++) {
        logs.push({
          id: nextId("log"),
          user_id: MOCK_USER_ID,
          definitionId: "mood",
          kind: "outcome",
          value: label,
          occurred_at: atOnDay(day, randInt(7, 22), randInt(0, 59)),
          logged_at: atOnDay(day, 22, 30),
          attributes: { at: "now" },
        });
      }
    }

    // input: daily_vibe — derived from the SAME counts via the same function
    // the live Mood-tap handler uses. Also skipped for today — with no Mood
    // taps yet, there's nothing to derive; the card falls back to "None"
    // across all six labels until the first tap.
    if (day < 60) {
      logs.push({
        id: nextId("log"),
        user_id: MOCK_USER_ID,
        definitionId: "daily_vibe",
        kind: "input",
        value: null,
        occurred_at: `${date}T21:30:00`,
        logged_at: `${date}T21:31:00`,
        attributes: moodCountsToVibeAttributes(counts),
      });
    }
  }
}
seedSixtyDayHistory();

/* ---------------- helpers ---------------- */

function filterLogs(
  all: LogEntry[],
  opts: {
    definitionId?: string;
    kind?: string;
    range?: string;
    date?: string;
    from?: string; // YYYY-MM-DD, inclusive — local-date basis
    to?: string; // YYYY-MM-DD, inclusive
  }
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
  // explicit from/to — used by the Dashboard/Insights custom range picker.
  // Date-string comparison, matching the local-date basis everywhere else.
  if (opts.from) out = out.filter((l) => l.occurred_at.slice(0, 10) >= opts.from!);
  if (opts.to) out = out.filter((l) => l.occurred_at.slice(0, 10) <= opts.to!);
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

  // A Mood tap recomputes that day's daily_vibe from the day's actual taps —
  // the one live derivation path (manual and free-text-derived vibe are
  // deferred). Mirrors how the historical seed derives it too.
  if (kind === "outcome" && definitionId === "mood") {
    upsertDailyVibeForDate(entry.occurred_at.slice(0, 10));
  }

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
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
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
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
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
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
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
    const removed = logs.find((l) => l.id === params.logId);
    logs = logs.filter((l) => l.id !== params.logId);
    // Mirrors appendLog's POST-side recompute — deleting a Mood tap (the
    // "Less" toggle on Today) must also update that day's daily_vibe, or the
    // LLM-facing sketch goes stale relative to what's actually logged.
    if (removed && removed.definitionId === "mood") {
      upsertDailyVibeForDate(removed.occurred_at.slice(0, 10));
    }
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

  // POST /insights/prompt { from?, to? } — FAST, local only. Computes the
  // real sketches and returns the exact prompt text (+ a display of the
  // forced tool schema) that /generate will send. Split out so the UI can
  // show this immediately, before waiting on the slow real LLM call.
  http.post("/api/insights/prompt", async ({ request }) => {
    const { from, to } = (await request.json().catch(() => ({}))) as {
      from?: string | null;
      to?: string | null;
    };
    try {
      const prompt = buildPrompt(from ?? null, to ?? null);
      return HttpResponse.json({ prompt, toolSchemaDisplay: toolSchemaDisplay() });
    } catch (e) {
      return HttpResponse.json(
        { error: e instanceof Error ? e.message : "prompt build failed" },
        { status: 500 }
      );
    }
  }),

  // POST /insights/generate { from?, to? } — SLOW (real Anthropic call,
  // ~30s). Recomputes the same sketches/prompt deterministically (cheap),
  // calls the real model with forced tool-use, and persists the result.
  // Thin-data honesty short-circuits before any network call for genuinely
  // sparse ranges.
  http.post("/api/insights/generate", async ({ request }) => {
    const { from, to } = (await request.json().catch(() => ({}))) as {
      from?: string | null;
      to?: string | null;
    };
    try {
      const result = await generateInsightsLive(from ?? null, to ?? null);
      insightStore.push(...result.insights);
      return HttpResponse.json(result, { status: 201 });
    } catch (e) {
      // Never let a bug (or an Anthropic API error) fall through unhandled —
      // that would bypass to real network and surface as a confusing
      // "not valid JSON" error instead of a visible, debuggable one.
      return HttpResponse.json(
        { error: e instanceof Error ? e.message : "insight generation failed" },
        { status: 500 }
      );
    }
  }),

  // interactive chat — range-scoped, NOT persisted. Real call, same sketch
  // dump as insights, but with the user's question as the tail instead of
  // the tool-forced insight instructions.
  http.post("/api/chat", async ({ request }) => {
    const { question, from, to } = (await request.json().catch(() => ({}))) as {
      question?: string;
      from?: string | null;
      to?: string | null;
    };
    const q = (question ?? "").trim();
    if (q.length === 0) {
      return HttpResponse.json({
        reply: "Ask me something specific about your logged data — for example, how your sleep relates to your evening meals.",
      });
    }
    try {
      const reply = await chatWithAnthropic(from ?? null, to ?? null, q);
      return HttpResponse.json({ reply });
    } catch (e) {
      return HttpResponse.json(
        { error: e instanceof Error ? e.message : "chat failed" },
        { status: 500 }
      );
    }
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

/* ---------------- range + count helpers ---------------- */

function rangeLabel(from: string | null, to: string | null): string {
  if (!from && !to) return "all logged days";
  const f = from ?? "the beginning";
  const t = to ?? "today";
  return `${f} – ${t}`;
}

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

/* ---------------- sketches (SQL-equivalent, computed here in the mock) ----
   Mirrors the target contract's sketch shape: count/n, mean/median/sd,
   min/max WITH DATES, deviation outliers WITH DATES, recent-window trend,
   completion rate, last-logged — plus enum/vibe-specific distribution,
   recent-window distribution, peak days, and longest streak. Nothing here
   is fabricated by an LLM; these are the deterministic numbers it reasons
   over (Constitution III / README "sketches-in-SQL, reasoning-in-LLM").
---------------------------------------------------------------------------*/

type DatedValue = { value: number; date: string };
type NumericSketch = {
  n: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: DatedValue | null;
  max: DatedValue | null;
  outliers: DatedValue[]; // |value - mean| > 1.5 * sd
  recentWindowMean: number | null; // last 7d in range
  priorWindowMean: number | null; // the 7d before that
  trendDelta: number | null;
  completionRate: number; // days-with-a-log / days-in-range
  lastLoggedDate: string | null;
};

function daysInRange(from: string | null, to: string | null): string[] {
  const f = from ? new Date(`${from}T00:00:00`) : dateForDayIndex(1);
  const t = to ? new Date(`${to}T00:00:00`) : new Date();
  const out: string[] = [];
  const cur = new Date(f);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(t);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const pad = (n: number) => String(n).padStart(2, "0");
    out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function last7dWindow(days: string[]): [string[], string[]] {
  const recent = days.slice(-7);
  const prior = days.slice(-14, -7);
  return [recent, prior];
}

function numericSketch(definitionId: string, from: string | null, to: string | null): NumericSketch {
  const days = daysInRange(from, to);
  const inRange = logs.filter(
    (l) => l.definitionId === definitionId && days.includes(l.occurred_at.slice(0, 10))
  );
  const n = inRange.length;
  if (n === 0) {
    return {
      n: 0, mean: null, median: null, sd: null, min: null, max: null,
      outliers: [], recentWindowMean: null, priorWindowMean: null, trendDelta: null,
      completionRate: 0, lastLoggedDate: null,
    };
  }
  const dated: DatedValue[] = inRange.map((l) => ({
    value: Number(l.value),
    date: l.occurred_at.slice(0, 10),
  }));
  const values = dated.map((d) => d.value).sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const minEntry = dated.reduce((a, b) => (b.value < a.value ? b : a));
  const maxEntry = dated.reduce((a, b) => (b.value > a.value ? b : a));
  const outliers = sd > 0
    ? dated.filter((d) => Math.abs(d.value - mean) > 1.5 * sd)
    : [];

  const [recentDays, priorDays] = last7dWindow(days);
  const recentVals = dated.filter((d) => recentDays.includes(d.date)).map((d) => d.value);
  const priorVals = dated.filter((d) => priorDays.includes(d.date)).map((d) => d.value);
  const recentWindowMean = recentVals.length
    ? recentVals.reduce((a, b) => a + b, 0) / recentVals.length : null;
  const priorWindowMean = priorVals.length
    ? priorVals.reduce((a, b) => a + b, 0) / priorVals.length : null;

  const loggedDays = new Set(dated.map((d) => d.date));
  const lastLoggedDate = [...loggedDays].sort().slice(-1)[0] ?? null;

  return {
    n,
    mean: round(mean, 2), median: round(median, 2), sd: round(sd, 2),
    min: { value: round(minEntry.value, 2), date: minEntry.date },
    max: { value: round(maxEntry.value, 2), date: maxEntry.date },
    outliers: outliers.map((o) => ({ value: round(o.value, 2), date: o.date })),
    recentWindowMean: recentWindowMean !== null ? round(recentWindowMean, 2) : null,
    priorWindowMean: priorWindowMean !== null ? round(priorWindowMean, 2) : null,
    trendDelta: recentWindowMean !== null && priorWindowMean !== null
      ? round(recentWindowMean - priorWindowMean, 2) : null,
    completionRate: round(loggedDays.size / days.length, 2),
    lastLoggedDate,
  };
}

type CompletionSketch = {
  n: number;
  completionRate: number;
  recentCompletionRate: number;
  longestGap: { startDate: string; endDate: string; days: number } | null;
  lastLoggedDate: string | null;
};

function completionSketch(definitionId: string, from: string | null, to: string | null): CompletionSketch {
  const days = daysInRange(from, to);
  const inRange = logs.filter(
    (l) => l.definitionId === definitionId && days.includes(l.occurred_at.slice(0, 10))
  );
  const loggedDays = new Set(inRange.map((l) => l.occurred_at.slice(0, 10)));
  const [recentDays] = last7dWindow(days);
  const recentLogged = recentDays.filter((d) => loggedDays.has(d)).length;

  // longest consecutive-day gap with no log
  let longestGap: { startDate: string; endDate: string; days: number } | null = null;
  let gapStart: string | null = null;
  let gapLen = 0;
  for (const d of days) {
    if (!loggedDays.has(d)) {
      if (gapStart === null) gapStart = d;
      gapLen++;
    } else {
      if (gapStart !== null && (!longestGap || gapLen > longestGap.days)) {
        longestGap = { startDate: gapStart, endDate: days[days.indexOf(d) - 1], days: gapLen };
      }
      gapStart = null;
      gapLen = 0;
    }
  }
  if (gapStart !== null && (!longestGap || gapLen > longestGap.days)) {
    longestGap = { startDate: gapStart, endDate: days[days.length - 1], days: gapLen };
  }

  return {
    n: inRange.length,
    completionRate: round(loggedDays.size / days.length, 2),
    recentCompletionRate: recentDays.length ? round(recentLogged / recentDays.length, 2) : 0,
    longestGap,
    lastLoggedDate: [...loggedDays].sort().slice(-1)[0] ?? null,
  };
}

type MoodSketch = {
  n: number;
  distribution: Record<string, number>;
  recentDistribution: Record<string, number>;
  lastLoggedLabel: string | null;
  lastLoggedDate: string | null;
};

function moodSketch(from: string | null, to: string | null): MoodSketch {
  const days = daysInRange(from, to);
  const inRange = logs.filter(
    (l) => l.definitionId === "mood" && days.includes(l.occurred_at.slice(0, 10))
  );
  const [recentDays] = last7dWindow(days);
  const distribution: Record<string, number> = {};
  const recentDistribution: Record<string, number> = {};
  for (const label of MOODS) {
    distribution[label] = 0;
    recentDistribution[label] = 0;
  }
  let last: LogEntry | null = null;
  for (const l of inRange) {
    const label = String(l.value);
    if (distribution[label] !== undefined) distribution[label]++;
    if (recentDays.includes(l.occurred_at.slice(0, 10)) && recentDistribution[label] !== undefined)
      recentDistribution[label]++;
    if (!last || l.occurred_at > last.occurred_at) last = l;
  }
  return {
    n: inRange.length,
    distribution,
    recentDistribution,
    lastLoggedLabel: last ? String(last.value) : null,
    lastLoggedDate: last ? last.occurred_at.slice(0, 10) : null,
  };
}

type VibeLabelSketch = {
  distribution: Record<VibeLevel, number>;
  recentDistribution: Record<VibeLevel, number>;
  peakDays: string[]; // days at 'often' or 'alot'
  longestElevatedStreak: { startDate: string; endDate: string; days: number } | null;
};
type DailyVibeSketch = Record<string, VibeLabelSketch>;

function dailyVibeSketch(from: string | null, to: string | null): DailyVibeSketch {
  const days = daysInRange(from, to);
  const inRange = logs
    .filter((l) => l.definitionId === "daily_vibe" && days.includes(l.occurred_at.slice(0, 10)))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const [recentDays] = last7dWindow(days);

  const out: DailyVibeSketch = {};
  for (const label of MOODS) {
    const distribution: Record<VibeLevel, number> = { none: 0, sometimes: 0, often: 0, alot: 0 };
    const recentDistribution: Record<VibeLevel, number> = { none: 0, sometimes: 0, often: 0, alot: 0 };
    const peakDays: string[] = [];
    let longestElevatedStreak: { startDate: string; endDate: string; days: number } | null = null;
    let streakStart: string | null = null;
    let streakLen = 0;

    for (const l of inRange) {
      const date = l.occurred_at.slice(0, 10);
      const level = ((l.attributes as Record<string, VibeLevel> | undefined)?.[label] ?? "none") as VibeLevel;
      distribution[level]++;
      if (recentDays.includes(date)) recentDistribution[level]++;
      const elevated = level === "often" || level === "alot";
      if (elevated) {
        peakDays.push(date);
        if (streakStart === null) streakStart = date;
        streakLen++;
      } else {
        if (streakStart !== null && (!longestElevatedStreak || streakLen > longestElevatedStreak.days)) {
          const idx = inRange.findIndex((x) => x.occurred_at.slice(0, 10) === date);
          const prevDate = idx > 0 ? inRange[idx - 1].occurred_at.slice(0, 10) : date;
          longestElevatedStreak = { startDate: streakStart, endDate: prevDate, days: streakLen };
        }
        streakStart = null;
        streakLen = 0;
      }
    }
    if (streakStart !== null && (!longestElevatedStreak || streakLen > longestElevatedStreak.days)) {
      const lastDate = inRange.length ? inRange[inRange.length - 1].occurred_at.slice(0, 10) : streakStart;
      longestElevatedStreak = { startDate: streakStart, endDate: lastDate, days: streakLen };
    }

    out[label] = { distribution, recentDistribution, peakDays, longestElevatedStreak };
  }
  return out;
}

/* ---------------- prompt builder (the fake LLM call the UI "types") ------- */

function fmtNumeric(name: string, unit: string, s: NumericSketch): string {
  if (s.n === 0) return `${name}: no logs in range.`;
  const outliersStr = s.outliers.length
    ? s.outliers.map((o) => `${o.value}${unit} on ${o.date}`).join(", ")
    : "none";
  return [
    `${name} (${unit}): n=${s.n}, mean=${s.mean}, median=${s.median}, sd=${s.sd}.`,
    `  min=${s.min?.value}${unit} on ${s.min?.date}, max=${s.max?.value}${unit} on ${s.max?.date}.`,
    `  outliers (>1.5sd): ${outliersStr}.`,
    `  last-7d avg=${s.recentWindowMean ?? "n/a"}, prior-7d avg=${s.priorWindowMean ?? "n/a"}, trend=${
      s.trendDelta !== null ? (s.trendDelta >= 0 ? "+" : "") + s.trendDelta : "n/a"
    }.`,
    `  completion=${Math.round(s.completionRate * 100)}%, last logged ${s.lastLoggedDate ?? "n/a"}.`,
  ].join("\n");
}

function fmtCompletion(name: string, s: CompletionSketch): string {
  const gap = s.longestGap
    ? `${s.longestGap.days}d (${s.longestGap.startDate} – ${s.longestGap.endDate})`
    : "none";
  return [
    `${name}: completion=${Math.round(s.completionRate * 100)}%, last-7d completion=${Math.round(
      s.recentCompletionRate * 100
    )}%.`,
    `  longest gap: ${gap}. last logged ${s.lastLoggedDate ?? "n/a"}.`,
  ].join("\n");
}

function fmtMood(s: MoodSketch): string {
  const distStr = MOODS.map((m) => `${m}:${s.distribution[m]}`).join(", ");
  const recentStr = MOODS.map((m) => `${m}:${s.recentDistribution[m]}`).join(", ");
  return [
    `Mood (in-the-moment taps): n=${s.n}.`,
    `  full-range distribution — ${distStr}.`,
    `  last-7d distribution — ${recentStr}.`,
    `  last logged: ${s.lastLoggedLabel ?? "n/a"} on ${s.lastLoggedDate ?? "n/a"}.`,
  ].join("\n");
}

function fmtDailyVibe(s: DailyVibeSketch): string {
  const lines = MOODS.map((label) => {
    const v = s[label];
    const dist = VIBE_LEVELS.map((l) => `${VIBE_LEVEL_LABEL[l]}:${v.distribution[l]}`).join(", ");
    const recent = VIBE_LEVELS.map((l) => `${VIBE_LEVEL_LABEL[l]}:${v.recentDistribution[l]}`).join(", ");
    const peak = v.peakDays.length ? v.peakDays.join(", ") : "none";
    const streak = v.longestElevatedStreak
      ? `${v.longestElevatedStreak.days}d (${v.longestElevatedStreak.startDate} – ${v.longestElevatedStreak.endDate})`
      : "none";
    return [
      `  ${label}: full-range [${dist}]; last-7d [${recent}].`,
      `    peak days (Often/A lot): ${peak}.`,
      `    longest elevated streak: ${streak}.`,
    ].join("\n");
  });
  return `Daily vibe (derived from Mood taps, per label):\n${lines.join("\n")}`;
}

// Shared sketch dump — used as the base for both insight generation (tail:
// forced-tool instructions) and chat (tail: the user's question).
function buildSketchDump(from: string | null, to: string | null): string {
  const scope = rangeLabel(from, to);
  const days = daysInRange(from, to);

  const weight = numericSketch("weight", from, to);
  const sleep = numericSketch("sleep", from, to);
  const lastMeal = numericSketch("last_meal", from, to);
  const water = numericSketch("water", from, to);
  const breathing = completionSketch("breathing", from, to);
  const stretches = completionSketch("stretches", from, to);
  const walking = completionSketch("walking", from, to);
  const mood = moodSketch(from, to);
  const vibe = dailyVibeSketch(from, to);

  return [
    `Here is the summarized data over ${scope} (${days.length} days) for the user, computed as statistical sketches — you are not given raw rows, only these numbers:`,
    "",
    fmtNumeric("Sleep", "h", sleep),
    "",
    fmtNumeric("Weight", "lbs", weight),
    "",
    fmtNumeric("Last meal (heaviness 1-5, logged at meal time)", "pts", lastMeal),
    "",
    fmtNumeric("Water intake", "oz", water),
    "",
    fmtCompletion("Breathing", breathing),
    "",
    fmtCompletion("Stretches", stretches),
    "",
    fmtCompletion("Walking", walking),
    "",
    fmtMood(mood),
    "",
    fmtDailyVibe(vibe),
  ].join("\n");
}

function buildPrompt(from: string | null, to: string | null): string {
  return [buildSketchDump(from, to), "", promptInstructions()].join("\n");
}

/* ---------------- chat: real call, same sketches, question as the tail --- */

const CHAT_MODEL = "claude-sonnet-4-6";

async function chatWithAnthropic(
  from: string | null,
  to: string | null,
  question: string
): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error(
      "No Anthropic API key found. Create apps/web/.env.local with one line: VITE_ANTHROPIC_API_KEY=sk-ant-..."
    );
  }

  const prompt = [
    buildSketchDump(from, to),
    "",
    `The user is asking a specific question about this data: "${question}"`,
    "",
    "Answer directly and conversationally, in 2-4 sentences. Ground your answer in the numbers above and quote them where relevant. Explicitly label any claim as a correlation or a hypothesis — never assert causation. If the sketches can't support a confident answer, say so honestly rather than guessing.",
  ].join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    throw new Error(`Network error calling Anthropic — check connectivity. (${e instanceof Error ? e.message : e})`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
  if (!textBlock?.text) throw new Error("Model response didn't include any text.");
  return textBlock.text as string;
}

/* ---------------- insight store + generation ---------------- */

const insightStore: Insight[] = [];
const GENERATED_BY = "claude-sonnet-4-6";

async function generateInsightsLive(from: string | null, to: string | null): Promise<GenerateResult> {
  const now = new Date().toISOString();
  const { total, entityCount } = countLogsInRange(from, to);
  const base = {
    user_id: MOCK_USER_ID,
    generated_at: now,
    range_from: from,
    range_to: to,
    generated_by: GENERATED_BY,
  };
  const prompt = buildPrompt(from, to);

  // thin data → one honest non-insight, no API call needed (only realistic
  // on a very narrow custom range; 30d/60d/all always clear this bar).
  if (total < 12 || entityCount < 3) {
    return {
      prompt,
      insights: [
        {
          ...base,
          id: nextId("ins"),
          title: "Not enough to say yet",
          body: `Over ${rangeLabel(from, to)} there are only ${total} logs across ${entityCount} ${
            entityCount === 1 ? "entity" : "entities"
          } — too sparse to draw anything trustworthy. Log a bit more, or ask me something specific in the chat below.`,
          confidence: "low",
          entityIds: [],
        },
      ],
    };
  }

  // The real call — forced tool-use, ~20-35s. Errors propagate up to the
  // handler's try/catch, which returns a visible mocked 500 instead of
  // letting a failure fall through to real network.
  const raw = await generateInsightsFromAnthropic(prompt);
  const insights: Insight[] = raw.map((r) => ({
    ...base,
    id: nextId("ins"),
    title: r.title,
    body: r.body,
    confidence: r.confidence,
    entityIds: r.entityIds,
  }));

  return { prompt, insights };
}

// Seed two OLD prior insights, sourced from an external Gemini run over the
// full 60-day window — kept as a second reference point alongside live
// Anthropic generations, dated slightly in the past so they sort below any
// freshly-generated batch.
(function seedInsights() {
  const toDate = isoDateForDayIndex(60);
  const fromDate = isoDateForDayIndex(1);
  const generatedAt = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(); // ~20h ago
  const GEMINI_GENERATED_BY = "Gemini (external, pre-generated)";

  const mk = (
    partial: Omit<Insight, "user_id" | "generated_at" | "range_from" | "range_to" | "generated_by">
  ): Insight => ({
    ...partial,
    user_id: MOCK_USER_ID,
    generated_at: generatedAt,
    range_from: fromDate,
    range_to: toDate,
    generated_by: GEMINI_GENERATED_BY,
  });

  insightStore.push(
    mk({
      id: nextId("ins"),
      title: "Sleep Dip Correlates with Extended Fatigue Window",
      body: "Correlation: The single lowest sleep log of 2 hours on July 28 immediately preceded a 9-day elevated streak of Tired and Meh daily vibes running from July 29 through August 6. Correlation: During this same fatigue window, walking consistency dropped to 0% with a 9-day logging gap from July 28 through August 5. Hypothesis: Severe acute sleep loss may trigger multi-day energy slumps that temporarily disrupt routine activity habits.",
      confidence: "high",
      entityIds: ["sleep", "daily_vibe", "walking"].map(normalizeEntityId),
    }),
    mk({
      id: nextId("ins"),
      title: "Lighter Evening Meals Align with Recent Energy Recovery",
      body: "Correlation: Over the last 7 days, last meal heaviness averaged 2.14 points compared to the prior 7-day average of 2.86 points, representing a -0.71 point trend. Correlation: This shift coincided with 0 days of elevated Tired or Meh vibes in the last 7 days, down from peak elevated levels earlier in the month. Hypothesis: Consuming lighter late meals may support better daytime energy and reduced feeling of fatigue.",
      confidence: "medium",
      entityIds: ["last_meal", "daily_vibe"].map(normalizeEntityId),
    })
  );
})();
