import { useCallback, useEffect, useState } from "react";
import { api, type DayLog } from "./api";

// One place owns "today". Every mutation goes to the API and replaces state
// with the server's returned truth — no optimistic local guessing, so the
// mock (and later the real backend) is always the source of truth.
export function useToday() {
  const [day, setDay] = useState<DayLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDay(await api.getToday());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(async (p: Partial<DayLog>) => {
    setDay(await api.patchToday(p));
  }, []);

  const addWater = useCallback(async (oz: number) => {
    setDay(await api.addWater(oz));
  }, []);

  const toggleHabit = useCallback(async (id: string) => {
    setDay(await api.toggleHabit(id));
  }, []);

  return { day, error, ready: day !== null, patch, addWater, toggleHabit };
}
