// Local-date math shared by the Dashboard and Insights range pickers. Local
// (not UTC) throughout, matching the mock's date convention everywhere else
// — see handlers.ts's comment on todayISODate/resolveOccurredAt.

export function localISODate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysISO(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return localISODate(d);
}

// The mock seeds exactly 60 days (day 1 .. day 60 = today) — custom ranges
// can't reach further back than that.
export const AVAILABLE_DAYS = 60;

export function availableBounds(): { min: string; max: string } {
  const max = localISODate();
  const min = addDaysISO(max, -(AVAILABLE_DAYS - 1));
  return { min, max };
}

export function clampToAvailable(dateISO: string): string {
  const { min, max } = availableBounds();
  if (dateISO < min) return min;
  if (dateISO > max) return max;
  return dateISO;
}

export function presetRange(days: number): { from: string; to: string } {
  const to = localISODate();
  const from = clampToAvailable(addDaysISO(to, -(days - 1)));
  return { from, to };
}

// oldest-first list of local YYYY-MM-DD strings between from/to, inclusive.
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
    guard++;
  }
  return out;
}
