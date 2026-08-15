import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Wind,
  StretchHorizontal,
  Footprints,
  Moon,
  UtensilsCrossed,
  Droplets,
  Scale,
  Smile,
  MessageSquareText,
  Check,
  Plus,
  Clock,
  Mic,
  Square,
} from "lucide-react";
import {
  todayDate,
  composeOccurredAt,
  useTodayLogs,
} from "../lib/use-today-logs";
import type { Definition, LogEntry } from "../lib/api";
import { api } from "../lib/api";
import { Card, SectionLabel, inputCls } from "../components/ui";

export const Route = createFileRoute("/")({ component: Today });

const nowHHMM = () => new Date().toTimeString().slice(0, 5);

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Today() {
  const [date] = useState(todayDate());
  const { inputs, outcomes, logsFor, ready, error, append, remove } =
    useTodayLogs(date);

  const byId = useMemo(() => {
    const m = new Map<string, Definition>();
    [...inputs, ...outcomes].forEach((d) => m.set(d.id, d));
    return m;
  }, [inputs, outcomes]);

  if (error)
    return (
      <div className="p-8 text-sm text-[var(--color-clay)]">
        Couldn't load. Is the dev server running with mocks enabled? ({error})
      </div>
    );
  if (!ready)
    return (
      <div className="p-8 text-sm text-[var(--color-ink-soft)]">Loading…</div>
    );

  const get = (id: string) => byId.get(id);

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
          Logs for the day
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold">
          {fmtDate(date)}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Times you enter attach to this date.
        </p>
      </header>

      <div className="space-y-6">
        <section>
          <SectionLabel>Daily checklist</SectionLabel>
          <div className="space-y-2">
            {["breathing", "stretches", "walking"].map((id) => {
              const def = get(id);
              return def ? (
                <BooleanCard
                  key={id}
                  def={def}
                  entries={logsFor(id)}
                  onAppend={append}
                  onRemove={remove}
                />
              ) : null;
            })}
          </div>
        </section>

        <section>
          <SectionLabel>Sleep &amp; meals</SectionLabel>
          <div className="space-y-3">
            {get("sleep") && (
              <SleepCard
                def={get("sleep")!}
                entries={logsFor("sleep")}
                date={date}
                onAppend={append}
                onRemove={remove}
              />
            )}
            {get("last_meal") && (
              <LastMealCard
                def={get("last_meal")!}
                entries={logsFor("last_meal")}
                date={date}
                onAppend={append}
              />
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Water</SectionLabel>
          {get("water") && (
            <WaterCard
              def={get("water")!}
              entries={logsFor("water")}
              date={date}
              onAppend={append}
            />
          )}
        </section>

        <section>
          <SectionLabel>Body</SectionLabel>
          {get("weight") && (
            <WeightCard
              def={get("weight")!}
              entries={logsFor("weight")}
              date={date}
              onAppend={append}
            />
          )}
        </section>

        <section>
          <SectionLabel>Mood</SectionLabel>
          {get("mood") && <MoodCard def={get("mood")!} entries={logsFor("mood")} />}
          {get("daily_vibe") && <DailyVibeCard def={get("daily_vibe")!} />}
        </section>

        <section>
          <SectionLabel>Note</SectionLabel>
          <NoteCard />
        </section>
      </div>
    </div>
  );
}

/* ---------- shared bits ---------- */

type AppendFn = (
  kind: "input" | "outcome",
  id: string,
  body: { value?: any; occurred_at?: string; attributes?: any }
) => Promise<void>;
type RemoveFn = (
  kind: "input" | "outcome",
  id: string,
  logId: string
) => Promise<void>;

function CardHead({
  icon: Icon,
  title,
  hint,
}: {
  icon: any;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon size={16} className="text-[var(--color-teal)]" />
        <span>{title}</span>
      </div>
      {hint && (
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{hint}</p>
      )}
    </div>
  );
}

// Optional time control: a compact toggle that reveals an HH:MM field.
function OptionalTime({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return value === null ? (
    <button
      onClick={() => onChange(nowHHMM())}
      className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-teal)]"
    >
      <Clock size={13} /> add time
    </button>
  ) : (
    <span className="inline-flex items-center gap-1">
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--color-line)] px-2 py-1 text-xs"
      />
      <button
        onClick={() => onChange(null)}
        className="text-xs text-[var(--color-ink-soft)] hover:underline"
      >
        clear
      </button>
    </span>
  );
}

const iconFor: Record<string, any> = {
  breathing: Wind,
  stretches: StretchHorizontal,
  walking: Footprints,
};

/* ---------- boolean checklist ---------- */

function BooleanCard({
  def,
  entries,
  onAppend,
  onRemove,
}: {
  def: Definition;
  entries: LogEntry[];
  onAppend: AppendFn;
  onRemove: RemoveFn;
}) {
  const done = entries.find((e) => e.value === true);
  const Icon = iconFor[def.id] ?? Check;

  const toggle = async () => {
    if (done) {
      await onRemove("input", def.id, done.id);
    } else {
      // Breathing and stretches are binary in the UI but carry a fixed 5-min
      // duration in the data model; walking's duration is left unset here.
      const fixedFive = def.id === "breathing" || def.id === "stretches";
      await onAppend("input", def.id, {
        value: true,
        ...(fixedFive ? { attributes: { duration_min: 5 } } : {}),
      });
    }
  };

  return (
    <button
      onClick={toggle}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
        done
          ? "border-[var(--color-teal)] bg-[var(--color-teal-soft)]"
          : "border-[var(--color-line)] bg-[var(--color-surface-2)] hover:border-[var(--color-teal)]"
      }`}
    >
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
          done
            ? "border-[var(--color-teal)] bg-[var(--color-teal)]"
            : "border-[var(--color-ink-soft)]"
        }`}
      >
        {done && <Check size={14} className="text-white" />}
      </span>
      <Icon size={16} className="shrink-0 text-[var(--color-ink-soft)]" />
      <span
        className={`text-sm font-medium ${
          done ? "line-through decoration-[var(--color-ink-soft)]" : ""
        }`}
      >
        {def.name}
      </span>
    </button>
  );
}

/* ---------- sleep (hours + quality + required bed time) ---------- */

function SleepCard({
  def,
  entries,
  date,
  onAppend,
  onRemove,
}: {
  def: Definition;
  entries: LogEntry[];
  date: string;
  onAppend: AppendFn;
  onRemove: RemoveFn;
}) {
  const [hours, setHours] = useState("");
  const [quality, setQuality] = useState(3);
  const [bed, setBed] = useState(nowHHMM());

  const add = async () => {
    if (!hours) return;
    await onAppend("input", def.id, {
      value: +hours,
      occurred_at: composeOccurredAt(date, bed),
      attributes: { quality },
    });
    setHours("");
  };

  return (
    <Card>
      <CardHead
        icon={Moon}
        title="Sleep"
        hint="Log each sleep or nap. Bed time required."
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--color-ink-soft)]">
            Hours slept
          </label>
          <input
            type="number"
            step="0.25"
            inputMode="decimal"
            placeholder="7.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-ink-soft)]">
            Bed time <span className="text-[var(--color-clay)]">*</span>
          </label>
          <input
            type="time"
            value={bed}
            onChange={(e) => setBed(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs text-[var(--color-ink-soft)]">
          Quality (1–5)
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((q) => (
            <button
              key={q}
              onClick={() => setQuality(q)}
              className={`h-8 flex-1 rounded-md text-xs font-medium transition ${
                quality === q
                  ? "bg-[var(--color-teal)] text-white"
                  : "bg-[var(--color-surface-2)] text-[var(--color-ink-soft)]"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={add}
        disabled={!hours}
        className="mt-3 flex items-center gap-1 rounded-lg bg-[var(--color-teal)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        <Plus size={14} /> Add sleep
      </button>

      {entries.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-[var(--color-line)] pt-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between text-xs text-[var(--color-ink-soft)]"
            >
              <span>
                {e.value}h · quality {(e.attributes as any)?.quality ?? "—"} ·
                bed {new Date(e.occurred_at).toTimeString().slice(0, 5)}
              </span>
              <button
                onClick={() => onRemove("input", def.id, e.id)}
                className="hover:text-[var(--color-clay)]"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- last meal (1–5 + required time) ---------- */

function LastMealCard({
  def,
  entries,
  date,
  onAppend,
}: {
  def: Definition;
  entries: LogEntry[];
  date: string;
  onAppend: AppendFn;
}) {
  const [heaviness, setHeaviness] = useState(3);
  const [time, setTime] = useState(nowHHMM());
  const existing = entries[entries.length - 1];

  const add = async () => {
    await onAppend("input", def.id, {
      value: heaviness,
      occurred_at: composeOccurredAt(date, time),
      attributes: { scale: "1-5" },
    });
  };

  return (
    <Card>
      <CardHead
        icon={UtensilsCrossed}
        title="Last meal"
        hint="Heaviness 1–5. Time required."
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--color-ink-soft)]">
            Heaviness
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((q) => (
              <button
                key={q}
                onClick={() => setHeaviness(q)}
                className={`h-8 flex-1 rounded-md text-xs font-medium transition ${
                  heaviness === q
                    ? "bg-[var(--color-teal)] text-white"
                    : "bg-[var(--color-surface-2)] text-[var(--color-ink-soft)]"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-ink-soft)]">
            Time <span className="text-[var(--color-clay)]">*</span>
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <button
        onClick={add}
        className="mt-3 flex items-center gap-1 rounded-lg bg-[var(--color-teal)] px-4 py-1.5 text-xs font-medium text-white"
      >
        <Plus size={14} /> {existing ? "Log again" : "Log meal"}
      </button>
      {existing && (
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
          Last logged: heaviness {existing.value} at{" "}
          {new Date(existing.occurred_at).toTimeString().slice(0, 5)}
        </p>
      )}
    </Card>
  );
}

/* ---------- water (quick-add + free-flow, day sum) ---------- */

function WaterCard({
  def,
  entries,
  date,
  onAppend,
}: {
  def: Definition;
  entries: LogEntry[];
  date: string;
  onAppend: AppendFn;
}) {
  const [free, setFree] = useState("");
  const [time, setTime] = useState<string | null>(null);
  const total = entries.reduce((s, e) => s + (Number(e.value) || 0), 0);
  const sizes = [
    { label: "Half cup", oz: 4 },
    { label: "Glass", oz: 8 },
    { label: "Bottle", oz: 16 },
    { label: "Flask", oz: 24 },
  ];

  const add = (oz: number) =>
    onAppend("input", def.id, {
      value: oz,
      occurred_at: time ? composeOccurredAt(date, time) : undefined,
    });

  const addFree = async () => {
    if (!free) return;
    await add(+free);
    setFree("");
  };

  return (
    <Card>
      <div className="mb-3 flex items-end justify-between">
        <CardHead icon={Droplets} title="Water intake" />
        <div className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--color-teal)]">
          {total}
          <span className="ml-1 text-sm font-normal text-[var(--color-ink-soft)]">
            oz
          </span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {sizes.map((s) => (
          <button
            key={s.label}
            onClick={() => add(s.oz)}
            className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 py-3 text-center transition hover:border-[var(--color-teal)] active:scale-95"
          >
            <div className="text-sm font-semibold text-[var(--color-teal)]">
              +{s.oz}
            </div>
            <div className="text-[10px] text-[var(--color-ink-soft)]">
              {s.label}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          placeholder="Enter total oz"
          value={free}
          onChange={(e) => setFree(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFree()}
          className={inputCls}
        />
        <button
          onClick={addFree}
          disabled={!free}
          className="shrink-0 rounded-lg bg-[var(--color-teal)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
      <div className="mt-2">
        <OptionalTime value={time} onChange={setTime} />
      </div>
    </Card>
  );
}

/* ---------- weight ---------- */

function WeightCard({
  def,
  entries,
  date,
  onAppend,
}: {
  def: Definition;
  entries: LogEntry[];
  date: string;
  onAppend: AppendFn;
}) {
  const [val, setVal] = useState("");
  const [time, setTime] = useState<string | null>(null);
  const last = entries[entries.length - 1];

  const add = async () => {
    if (!val) return;
    await onAppend("outcome", def.id, {
      value: +val,
      occurred_at: time ? composeOccurredAt(date, time) : undefined,
      attributes: { unit: def.unit },
    });
    setVal("");
  };

  return (
    <Card>
      <CardHead icon={Scale} title="Weight" hint="Logged neutrally — just a record." />
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          placeholder="—"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className={inputCls}
        />
        <span className="text-sm text-[var(--color-ink-soft)]">{def.unit}</span>
        <button
          onClick={add}
          disabled={!val}
          className="shrink-0 rounded-lg bg-[var(--color-teal)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          Log
        </button>
      </div>
      <div className="mt-2">
        <OptionalTime value={time} onChange={setTime} />
      </div>
      {last && (
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
          Last: {last.value} {def.unit}
        </p>
      )}
    </Card>
  );
}

/* ---------- mood: one-tap "now" ---------- */

const moodTone: Record<string, string> = {
  Energized: "text-[var(--color-teal)]",
  Focused: "text-[var(--color-teal)]",
  Calm: "text-[var(--color-teal)]",
  Tired: "text-[var(--color-ink-soft)]",
  Stressed: "text-[var(--color-clay)]",
  Meh: "text-[var(--color-ink-soft)]",
};

function MoodCard({ def, entries }: { def: Definition; entries: LogEntry[] }) {
  const [flash, setFlash] = useState<string | null>(null);
  const counts = entries.reduce<Record<string, number>>((m, e) => {
    const k = String(e.value);
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});

  const tap = async (mood: string) => {
    setFlash(mood);
    await api.addLog("outcome", def.id, {
      value: mood,
      attributes: { at: "now" },
    });
    setTimeout(() => setFlash(null), 500);
  };

  return (
    <Card>
      <CardHead
        icon={Smile}
        title="Mood"
        hint="Tap how you feel, anytime. Each tap logs the moment."
      />
      <div className="grid grid-cols-3 gap-2">
        {(def.enumOptions ?? []).map((m) => (
          <button
            key={m}
            onClick={() => tap(m)}
            className={`rounded-xl border px-2 py-3 text-sm font-medium transition active:scale-95 ${
              flash === m
                ? "border-[var(--color-teal)] bg-[var(--color-teal-soft)]"
                : "border-[var(--color-line)] bg-[var(--color-surface-2)] hover:border-[var(--color-teal)]"
            } ${moodTone[m] ?? ""}`}
          >
            {m}
            {counts[m] ? (
              <span className="ml-1 text-[10px] text-[var(--color-ink-soft)]">
                ×{counts[m]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---------- daily_vibe: disabled preview ---------- */

function DailyVibeCard({ def }: { def: Definition }) {
  const levels = ["Sometimes", "Often", "Most of the day"];
  return (
    <Card className="mt-3 opacity-60">
      <CardHead
        icon={Smile}
        title="Daily vibe"
        hint="End-of-day summary with a frequency. Coming soon — collated from your Mood taps."
      />
      <div className="pointer-events-none">
        <div className="grid grid-cols-3 gap-2">
          {(def.enumOptions ?? []).map((m) => (
            <div
              key={m}
              className="rounded-xl border border-dashed border-[var(--color-line)] px-2 py-3 text-center text-sm text-[var(--color-ink-soft)]"
            >
              {m}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1">
          {levels.map((l) => (
            <div
              key={l}
              className="flex-1 rounded-md border border-dashed border-[var(--color-line)] py-1 text-center text-[10px] text-[var(--color-ink-soft)]"
            >
              {l}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ---------- note → captures ---------- */

function NoteCard() {
  const [mode, setMode] = useState<"record" | "write">("record");
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!text.trim()) return;
    await api.addCapture(text, "note");
    setText("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between">
        <CardHead
          icon={MessageSquareText}
          title="Notes for the day"
          hint={
            mode === "record"
              ? "Record your 30-sec note — how was your sleep, walk, other habits?"
              : "Type your note below — or switch back to record it."
          }
        />
        <button
          onClick={() => setMode(mode === "record" ? "write" : "record")}
          className="shrink-0 rounded-full border border-[var(--color-line)] px-3 py-1 text-[11px] font-medium text-[var(--color-ink-soft)] transition hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]"
        >
          {mode === "record" ? "Type instead" : "Record instead"}
        </button>
      </div>

      {mode === "record" ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            onClick={() => setRecording((r) => !r)}
            className={`grid h-16 w-16 place-items-center rounded-full transition active:scale-95 ${
              recording
                ? "bg-[var(--color-clay)] text-white"
                : "bg-[var(--color-teal)] text-white"
            }`}
            aria-label={recording ? "Stop recording" : "Start recording"}
          >
            {recording ? <Square size={22} /> : <Mic size={24} />}
          </button>
          <div className="text-xs text-[var(--color-ink-soft)]">
            {recording ? "Recording… tap to stop" : "Tap to start recording"}
          </div>
          <p className="text-center text-[11px] text-[var(--color-ink-soft)]">
            You can type it in as well — use “Type instead”.
          </p>
        </div>
      ) : (
        <>
          <textarea
            rows={3}
            placeholder="Anything worth remembering about today…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={`${inputCls} resize-none`}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            {saved && (
              <span className="text-xs text-[var(--color-teal)]">Saved</span>
            )}
            <button
              onClick={save}
              disabled={!text.trim()}
              className="rounded-lg bg-[var(--color-teal)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Save note
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
