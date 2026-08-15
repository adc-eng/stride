import type { ReactNode } from "react";

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
