import type { ReactNode } from "react";
import { availableBounds, presetRange, clampToAvailable } from "../lib/date-range";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
      {children}
    </h2>
  );
}

export function FieldLabel({
  icon: Icon,
  children,
}: {
  icon: any;
  children: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
      <Icon size={16} className="text-[var(--color-teal)]" />
      <span>{children}</span>
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-teal)] focus:ring-2 focus:ring-[var(--color-teal-soft)]";

/* ---------------- range picker (Dashboard + Insights) ---------------- */
// 30d / 60d presets, or a custom {from,to} bounded to the mock's available
// 60-day window (see ../lib/date-range). Shared so both views behave and
// look identical.

export type RangeMode = "30d" | "60d" | "custom";
export type RangeValue = { mode: RangeMode; from: string; to: string };

export function defaultRangeValue(mode: RangeMode = "60d"): RangeValue {
  if (mode === "custom") {
    const { min, max } = availableBounds();
    return { mode, from: min, to: max };
  }
  const { from, to } = presetRange(mode === "30d" ? 30 : 60);
  return { mode, from, to };
}

export function RangePicker({
  value,
  onChange,
}: {
  value: RangeValue;
  onChange: (v: RangeValue) => void;
}) {
  const { min, max } = availableBounds();

  const pick = (mode: RangeMode) => {
    if (mode === "custom") {
      onChange({ mode, from: value.from || min, to: value.to || max });
    } else {
      const { from, to } = presetRange(mode === "30d" ? 30 : 60);
      onChange({ mode, from, to });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-[var(--color-line)] p-1">
        {(["30d", "60d", "custom"] as RangeMode[]).map((m) => (
          <button
            key={m}
            onClick={() => pick(m)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              value.mode === m
                ? "bg-[var(--color-teal)] text-white"
                : "text-[var(--color-ink-soft)]"
            }`}
          >
            {m === "30d" ? "Last 30 days" : m === "60d" ? "Last 60 days" : "Custom"}
          </button>
        ))}
      </div>

      {value.mode === "custom" && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
          <input
            type="date"
            min={min}
            max={value.to || max}
            value={value.from}
            onChange={(e) =>
              onChange({
                mode: "custom",
                from: clampToAvailable(e.target.value),
                to: value.to,
              })
            }
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1"
          />
          <span>–</span>
          <input
            type="date"
            min={value.from || min}
            max={max}
            value={value.to}
            onChange={(e) =>
              onChange({
                mode: "custom",
                from: value.from,
                to: clampToAvailable(e.target.value),
              })
            }
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1"
          />
        </div>
      )}
    </div>
  );
}
