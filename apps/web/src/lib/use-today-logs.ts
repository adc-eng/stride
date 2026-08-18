import { useCallback, useEffect, useState } from "react";
import {
  api,
  type Definition,
  type EntityKind,
  type LogEntry,
  type NewLog,
} from "./api";

export function todayDate(): string {
  // Local calendar date — must match the mock's local-date convention (see
  // handlers.ts) or "today" here and "today" in the seed/dashboard drift
  // apart for part of every day depending on timezone.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Composes a local (not UTC) occurred_at from the page date + an HH:MM time
// string — no toISOString() here, since that converts to UTC and can shift
// the calendar date near midnight, breaking the local-date convention the
// rest of the app (seed data, Dashboard bucketing) relies on.
export function composeOccurredAt(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00`;
}

export function useTodayLogs(date: string) {
  const [inputs, setInputs] = useState<Definition[]>([]);
  const [outcomes, setOutcomes] = useState<Definition[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [defsReady, setDefsReady] = useState(false);
  const [logsReady, setLogsReady] = useState(false);

  // Definitions change only when the user creates/edits a tracked thing — not
  // on every log — so they load once on mount and are not re-fetched by writes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ins, outs] = await Promise.all([
          api.listInputs(),
          api.listOutcomes(),
        ]);
        if (cancelled) return;
        setInputs(ins);
        setOutcomes(outs);
        setDefsReady(true);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load definitions");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Logs are the only thing a write invalidates, so this is what append/remove
  // re-run — two GET /logs calls, no definition refetch.
  const reloadLogs = useCallback(async () => {
    try {
      const [inLogs, outLogs] = await Promise.all([
        api.listAllLogs("input", { date }),
        api.listAllLogs("outcome", { date }),
      ]);
      setLogs([...inLogs, ...outLogs]);
      setLogsReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    }
  }, [date]);

  useEffect(() => {
    reloadLogs();
  }, [reloadLogs]);

  const logsFor = useCallback(
    (definitionId: string) =>
      logs.filter((l) => l.definitionId === definitionId),
    [logs]
  );

  const append = useCallback(
    async (kind: EntityKind, id: string, body: NewLog) => {
      await api.addLog(kind, id, body);
      await reloadLogs();
    },
    [reloadLogs]
  );

  const remove = useCallback(
    async (kind: EntityKind, id: string, logId: string) => {
      await api.deleteLog(kind, id, logId);
      await reloadLogs();
    },
    [reloadLogs]
  );

  return {
    inputs,
    outcomes,
    logsFor,
    ready: defsReady && logsReady,
    error,
    append,
    remove,
    reload: reloadLogs,
  };
}
