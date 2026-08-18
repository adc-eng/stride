// Single source of truth for Mood/Daily-vibe constants and the tap-count →
// level mapping. Previously duplicated between handlers.ts and dashboard.tsx
// — centralizing avoids the two copies drifting (as happened with the
// local/UTC date logic).

export const MOODS = ["Energized", "Focused", "Calm", "Tired", "Stressed", "Meh"];

export type VibeLevel = "none" | "sometimes" | "often" | "alot";
export const VIBE_LEVELS: VibeLevel[] = ["none", "sometimes", "often", "alot"];
export const VIBE_LEVEL_SCORE: Record<VibeLevel, number> = {
  none: 0,
  sometimes: 1,
  often: 2,
  alot: 3,
};
export const VIBE_LEVEL_LABEL: Record<VibeLevel, string> = {
  none: "None",
  sometimes: "Sometimes",
  often: "Often",
  alot: "A lot",
};

// Bottom-to-top stacking order for the Dashboard's stacked daily-vibe bar.
export const VIBE_STACK_ORDER = ["Stressed", "Tired", "Meh", "Calm", "Focused", "Energized"];

// One color per label, shared by the Mood buttons (Today) and the stacked
// vibe bar (Dashboard) so the two views read as the same visual language.
export const VIBE_COLORS: Record<string, string> = {
  Stressed: "#c0392b", // red
  Tired: "#d9822b", // orange
  Meh: "#9aa1a6", // grey
  Calm: "#5b9bd5", // sky blue
  Focused: "#8fbf6f", // light green
  Energized: "#2f7d4f", // dark green
};

// How "full" a button/tile should look at each level — used with VIBE_COLORS
// so the Mood buttons visibly fill in as taps accumulate, same colors as the
// Dashboard's stacked bar.
export const VIBE_LEVEL_FILL_ALPHA: Record<VibeLevel, number> = {
  none: 0.06,
  sometimes: 0.28,
  often: 0.58,
  alot: 0.92,
};

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Tap-count -> level. 0 -> none, 1 -> sometimes, 2-3 -> often, 4+ -> alot.
// A flat "3+" threshold was tried first but collapsed e.g. 3 taps and 7 taps
// into the same bucket — raising the top threshold to 4 keeps a mid count
// (2-3) distinguishable from a heavy one (4+).
export function tapCountToLevel(count: number): VibeLevel {
  if (count <= 0) return "none";
  if (count === 1) return "sometimes";
  if (count <= 3) return "often";
  return "alot";
}

export function moodCountsToVibeAttributes(
  counts: Record<string, number>
): Record<string, VibeLevel> {
  const out: Record<string, VibeLevel> = {};
  for (const label of MOODS) out[label] = tapCountToLevel(counts[label] ?? 0);
  return out;
}
