import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { api, type LogEntry } from "../lib/api";
import { Card, SectionLabel } from "../components/ui";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

/* =======================================================================
   Data layer: the mock returns RAW logs. Everything below summarizes them
   client-side into day buckets — this is the demo's end state too.
   ======================================================================= */

const DAYS = 14;
const TEAL = "var(--color-teal)";
const CLAY = "var(--color-clay)";
const SAND = "var(--color-sand)";
const INKSOFT = "var(--color-ink-soft)";

// last N calendar days as YYYY-MM-DD, oldest first
function lastNDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });

const dayOf = (l: LogEntry) => l.occurred_at.slice(0, 10);
const hourFloat = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
};

// group logs by day into a map
function byDay(logs: LogEntry[]): Map<string, LogEntry[]> {
  const m = new Map<string, LogEntry[]>();
  for (const l of logs) {
    const k = dayOf(l);
    (m.get(k) ?? m.set(k, []).get(k)!).push(l);
  }
  return m;
}

type Row = Record<string, number | string | null>;

function useAllData() {
  const [data, setData] = useState<{
    weight: LogEntry[];
    sleep: LogEntry[];
    lastMeal: LogEntry[];
    water: LogEntry[];
    breathing: LogEntry[];
    stretches: LogEntry[];
    walking: LogEntry[];
    vibe: LogEntry[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const range = `${DAYS}d`;
        const [
          weight,
          sleep,
          lastMeal,
          water,
          breathing,
          stretches,
          walking,
          vibe,
        ] = await Promise.all([
          api.listLogs("outcome", "weight", { range }),
          api.listLogs("input", "sleep", { range }),
          api.listLogs("input", "last_meal", { range }),
          api.listLogs("input", "water", { range }),
          api.listLogs("input", "breathing", { range }),
          api.listLogs("input", "stretches", { range }),
          api.listLogs("input", "walking", { range }),
          api.listLogs("input", "daily_vibe", { range }),
        ]);
        setData({
          weight,
          sleep,
          lastMeal,
          water,
          breathing,
          stretches,
          walking,
          vibe,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, []);

  return { data, error };
}

/* =======================================================================
   Small chart primitives
   ======================================================================= */

function ChartFrame({
  title,
  hint,
  children,
  faded = false,
  badge,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  faded?: boolean;
  badge?: string;
}) {
  return (
    <Card className={faded ? "relative overflow-hidden" : ""}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {badge && (
          <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
            {badge}
          </span>
        )}
      </div>
      {hint && <p className="mb-2 text-xs text-[var(--color-ink-soft)]">{hint}</p>}
      <div className={faded ? "pointer-events-none opacity-45" : ""}>
        {children}
      </div>
    </Card>
  );
}

const axisProps = {
  tick: { fontSize: 10, fill: "var(--color-ink-soft)" },
  stroke: "var(--color-line)",
  tickLine: false,
  axisLine: false,
};

// Consistent chart margins — NO negative left margin (that was pushing the
// Y-axis off-canvas and garbling ticks). Y-axis gets real width so labels fit.
const CHART_MARGIN = { top: 6, right: 8, bottom: 0, left: 0 };
const Y_WIDTH = 30;

function tooltipStyle() {
  return {
    contentStyle: {
      background: "var(--color-surface)",
      border: "1px solid var(--color-line)",
      borderRadius: 8,
      fontSize: 12,
    },
  };
}

/* =======================================================================
   Dashboard
   ======================================================================= */

function Dashboard() {
  const { data, error } = useAllData();
  const days = lastNDays(DAYS);

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
          Last {DAYS} days
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold">
          Dashboard
        </h1>
      </header>

      {error && (
        <p className="mb-4 text-sm text-[var(--color-clay)]">
          Couldn't load ({error})
        </p>
      )}
      {!data ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : (
        <div className="space-y-6">
          {/* ---------- Outcomes: weight + daily vibe ---------- */}
          <section>
            <SectionLabel>Outcomes</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <WeightChart logs={data.weight} days={days} />
              <VibeChart logs={data.vibe} days={days} />
            </div>
          </section>

          {/* sleek semi-visible divider */}
          <div
            className="h-px w-full"
            style={{
              background:
                "linear-gradient(to right, transparent, var(--color-line), transparent)",
            }}
          />

          {/* ---------- Inputs ---------- */}
          <section>
            <SectionLabel>Inputs</SectionLabel>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <SleepHoursChart logs={data.sleep} days={days} />
                <BedTimeChart logs={data.sleep} days={days} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <WaterChart logs={data.water} days={days} />
                <LastMealChart logs={data.lastMeal} days={days} />
              </div>
              <BinaryHabitChart
                title="Focussed Breathing"
                logs={data.breathing}
                days={days}
                color={TEAL}
              />
              <BinaryHabitChart
                title="Stretches"
                logs={data.stretches}
                days={days}
                color={SAND}
              />
              <WalkingChart logs={data.walking} days={days} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* =======================================================================
   Outcome charts
   ======================================================================= */

function WeightChart({ logs, days }: { logs: LogEntry[]; days: string[] }) {
  const m = byDay(logs);
  const rows: Row[] = days.map((d) => {
    const dayLogs = m.get(d) ?? [];
    const v = dayLogs.length ? Number(dayLogs[dayLogs.length - 1].value) : null;
    return { day: dayLabel(d), value: v };
  });
  const vals = rows.map((r) => r.value).filter((v): v is number => v != null);
  const min = Math.floor(Math.min(...vals)) - 1;
  const max = Math.ceil(Math.max(...vals)) + 1;

  return (
    <ChartFrame title="Weight" hint="lbs">
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={rows} margin={CHART_MARGIN}>
          <XAxis dataKey="day" {...axisProps} interval={3} />
          <YAxis
            domain={[min, max]}
            {...axisProps}
            width={Y_WIDTH}
            tickCount={4}
            allowDecimals={false}
          />
          <Tooltip {...tooltipStyle()} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={TEAL}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

const VIBES = ["Energized", "Focused", "Calm", "Tired", "Stressed", "Meh"];
const VIBE_COLORS: Record<string, string> = {
  Energized: "var(--color-teal)",
  Focused: "var(--color-teal)",
  Calm: "var(--color-teal-soft)",
  Tired: "var(--color-ink-soft)",
  Stressed: "var(--color-clay)",
  Meh: "var(--color-sand)",
};

// Daily vibe: greyed but live. Counts each vibe type across the window.
function VibeChart({ logs, days }: { logs: LogEntry[]; days: string[] }) {
  const inWindow = new Set(days);
  const counts = new Map<string, number>(VIBES.map((v) => [v, 0]));
  for (const l of logs) {
    if (!inWindow.has(dayOf(l))) continue;
    const v = String(l.value);
    if (counts.has(v)) counts.set(v, counts.get(v)! + 1);
  }
  const rows: Row[] = VIBES.map((v) => ({ vibe: v, count: counts.get(v) ?? 0 }));

  return (
    <ChartFrame title="Daily vibe" badge="preview" faded>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <XAxis
            dataKey="vibe"
            {...axisProps}
            interval={0}
            tickFormatter={(s: string) => s.slice(0, 3)}
          />
          <YAxis {...axisProps} width={Y_WIDTH} allowDecimals={false} tickCount={4} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {rows.map((r, i) => (
              <Cell key={i} fill={VIBE_COLORS[r.vibe as string] ?? INKSOFT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/* =======================================================================
   Input charts
   ======================================================================= */

function SleepHoursChart({ logs, days }: { logs: LogEntry[]; days: string[] }) {
  const m = byDay(logs);
  const rows: Row[] = days.map((d) => {
    const dl = m.get(d) ?? [];
    // sum hours across sleeps that day (naps included)
    const total = dl.reduce((s, l) => s + (Number(l.value) || 0), 0);
    return { day: dayLabel(d), hours: dl.length ? +total.toFixed(2) : null };
  });
  return (
    <ChartFrame title="Sleep" hint="hours / day">
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <XAxis dataKey="day" {...axisProps} interval={3} />
          <YAxis
            {...axisProps}
            width={Y_WIDTH}
            domain={[0, 10]}
            ticks={[0, 5, 10]}
            allowDecimals={false}
          />
          <Tooltip {...tooltipStyle()} />
          <Bar dataKey="hours" fill={TEAL} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// Bed time: plot the occurred_at hour-of-day per night (wraps past midnight
// handled by adding 24 to early-morning hours so the line reads naturally).
function BedTimeChart({ logs, days }: { logs: LogEntry[]; days: string[] }) {
  const m = byDay(logs);
  const rows: Row[] = days.map((d) => {
    const dl = m.get(d) ?? [];
    if (!dl.length) return { day: dayLabel(d), bed: null };
    let h = hourFloat(dl[dl.length - 1].occurred_at);
    if (h < 12) h += 24; // 1am → 25 so it sits above 11pm
    return { day: dayLabel(d), bed: +h.toFixed(2) };
  });
  const fmt = (h: number) => {
    const hh = Math.floor(h % 24);
    const mm = Math.round((h % 1) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  return (
    <ChartFrame title="Bed time" hint="when sleep started">
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={rows} margin={CHART_MARGIN}>
          <XAxis dataKey="day" {...axisProps} interval={3} />
          <YAxis
            domain={[20, 26]}
            ticks={[21, 23, 25]}
            tickFormatter={fmt}
            {...axisProps}
            width={Y_WIDTH + 8}
          />
          <Tooltip {...tooltipStyle()} formatter={(v: any) => fmt(Number(v))} />
          <Line
            type="monotone"
            dataKey="bed"
            stroke={SAND}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function WaterChart({ logs, days }: { logs: LogEntry[]; days: string[] }) {
  const m = byDay(logs);
  const rows: Row[] = days.map((d) => {
    const dl = m.get(d) ?? [];
    const total = dl.reduce((s, l) => s + (Number(l.value) || 0), 0);
    return { day: dayLabel(d), oz: total || null };
  });
  const WaterTip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line)",
          borderRadius: 8,
          padding: "4px 8px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>
          {p.oz ?? 0} oz
        </div>
        <div style={{ fontSize: 10, color: "var(--color-ink-soft)" }}>{p.day}</div>
      </div>
    );
  };
  return (
    <ChartFrame title="Water" hint="total oz / day">
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <XAxis dataKey="day" {...axisProps} interval={3} />
          <YAxis {...axisProps} width={Y_WIDTH} tickCount={4} allowDecimals={false} />
          <Tooltip {...tooltipStyle()} content={<WaterTip />} />
          <Bar dataKey="oz" fill="var(--color-teal-soft)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// Last meal: scatter of meal-time (y = hour) with dot SIZE = heaviness (1-5).
function LastMealChart({ logs, days }: { logs: LogEntry[]; days: string[] }) {
  const idx = new Map(days.map((d, i) => [d, i]));
  const points = logs
    .filter((l) => idx.has(dayOf(l)))
    .map((l) => ({
      x: idx.get(dayOf(l))!,
      y: +hourFloat(l.occurred_at).toFixed(2),
      z: Number(l.value) || 1, // heaviness → bubble size (not shown in tooltip)
      time: new Date(l.occurred_at).toTimeString().slice(0, 5),
    }));
  const fmtH = (h: number) => {
    const hh = Math.floor(h);
    const mm = Math.round((h % 1) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  const MealTip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line)",
          borderRadius: 8,
          fontSize: 12,
          padding: "4px 8px",
          color: "var(--color-ink)",
        }}
      >
        {payload[0].payload.time}
      </div>
    );
  };
  return (
    <ChartFrame title="Last meal" hint="time · dot size = heaviness">
      <ResponsiveContainer width="100%" height={130}>
        <ScatterChart margin={CHART_MARGIN}>
          <XAxis
            type="number"
            dataKey="x"
            domain={[-0.5, days.length - 0.5]}
            ticks={[0, 4, 8, 12]}
            tickFormatter={(i: number) => dayLabel(days[i] ?? days[0])}
            {...axisProps}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[17, 22]}
            ticks={[18, 19, 20, 21]}
            tickFormatter={(h: number) => fmtH(h)}
            {...axisProps}
            width={Y_WIDTH + 8}
          />
          <ZAxis type="number" dataKey="z" range={[30, 260]} domain={[1, 5]} />
          <Tooltip {...tooltipStyle()} content={<MealTip />} />
          <Scatter data={points} fill={CLAY} fillOpacity={0.55} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// Breathing / stretches: binary done vs not-done per day (duration is a fixed
// 5 min in the data, so a minutes chart would be flat — done/not-done is the
// real signal).
function BinaryHabitChart({
  title,
  logs,
  days,
  color,
}: {
  title: string;
  logs: LogEntry[];
  days: string[];
  color: string;
}) {
  const m = byDay(logs);
  const rows: Row[] = days.map((d) => ({
    day: dayLabel(d),
    done: (m.get(d) ?? []).some((l) => l.value === true) ? 1 : 0,
  }));
  const DoneTip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line)",
          borderRadius: 8,
          padding: "4px 8px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>
          {p.done ? "Done" : "Not done"}
        </div>
        <div style={{ fontSize: 10, color: "var(--color-ink-soft)" }}>{p.day}</div>
      </div>
    );
  };
  return (
    <ChartFrame title={title} hint="done each day">
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <XAxis dataKey="day" {...axisProps} interval={3} />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 1]}
            tickFormatter={(v: number) => (v ? "✓" : "·")}
            {...axisProps}
            width={Y_WIDTH}
          />
          <Tooltip {...tooltipStyle()} content={<DoneTip />} />
          <Bar dataKey="done" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// Walking: minutes per day from attributes.duration_min.
function WalkingChart({ logs, days }: { logs: LogEntry[]; days: string[] }) {
  const m = byDay(logs);
  const rows: Row[] = days.map((d) => {
    const dl = m.get(d) ?? [];
    const mins = dl.reduce(
      (s, l) => s + (Number((l.attributes as any)?.duration_min) || 0),
      0
    );
    return { day: dayLabel(d), minutes: mins || null };
  });
  return (
    <ChartFrame title="Walking" hint="minutes / day">
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          <XAxis dataKey="day" {...axisProps} interval={3} />
          <YAxis {...axisProps} width={Y_WIDTH} tickCount={4} allowDecimals={false} />
          <Tooltip {...tooltipStyle()} />
          <Bar dataKey="minutes" fill={TEAL} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
