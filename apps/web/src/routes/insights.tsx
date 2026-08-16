import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Wand2, Paperclip } from "lucide-react";
import { api, type GenerateParams, type Insight } from "../lib/api";
import { Card, SectionLabel, inputCls } from "../components/ui";

export const Route = createFileRoute("/insights")({ component: Insights });

type Msg = { role: "you" | "stride"; text: string };
type RangeKey = "all" | "7d" | "30d";

// Turn a preset into {from,to}. 'all' → no bounds.
function rangeParams(key: RangeKey): GenerateParams {
  if (key === "all") return { from: null, to: null };
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (key === "7d" ? 7 : 30));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const rangeLabels: Record<RangeKey, string> = {
  all: "All days",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const confTone: Record<string, string> = {
  low: "text-[var(--color-ink-soft)]",
  medium: "text-[var(--color-sand)]",
  high: "text-[var(--color-teal)]",
};

function fmtRange(ins: Insight): string {
  if (!ins.range_from && !ins.range_to) return "all days";
  return `${ins.range_from ?? "start"} – ${ins.range_to ?? "today"}`;
}
function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Insights() {
  const [range, setRange] = useState<RangeKey>("all");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // fetch-on-load: just show the last stored insights (no auto-generate)
  useEffect(() => {
    api
      .listInsights(10)
      .then(setInsights)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load insights")
      );
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, pending]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await api.generateInsights(rangeParams(range));
      // re-fetch so the list reflects the store (newest first)
      setInsights(await api.listInsights(10));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const send = async () => {
    const q = draft.trim();
    if (!q || pending) return;
    setMessages((m) => [...m, { role: "you", text: q }]);
    setDraft("");
    setPending(true);
    try {
      const { reply } = await api.chat(q, rangeParams(range));
      setMessages((m) => [...m, { role: "stride", text: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "stride", text: "Couldn't reach the reasoning service." },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-10">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
          What your data suggests
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold">
          Insights
        </h1>
      </header>

      {/* page-level range — scopes both generate and chat */}
      <div className="mb-6 flex items-center gap-2">
        <div className="flex rounded-lg border border-[var(--color-line)] p-1">
          {(["all", "7d", "30d"] as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                range === k
                  ? "bg-[var(--color-teal)] text-white"
                  : "text-[var(--color-ink-soft)]"
              }`}
            >
              {rangeLabels[k]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--color-clay)]">({error})</p>}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Generated insights</SectionLabel>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-teal)] px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
          >
            <Wand2 size={14} />
            {generating ? "Generating…" : "Generate top insights"}
          </button>
        </div>

        <div className="max-h-[19rem] space-y-3 overflow-y-auto pr-1">
          {insights.length === 0 && !generating && (
            <Card>
              <p className="text-sm text-[var(--color-ink-soft)]">
                No insights yet. Pick a range and tap “Generate top insights”.
              </p>
            </Card>
          )}
          {insights.map((ins) => (
            <Card key={ins.id}>
              <div className="mb-1 flex items-center gap-2">
                <Sparkles size={15} className="text-[var(--color-teal)]" />
                <h3 className="text-sm font-semibold">{ins.title}</h3>
                <span
                  className={`ml-auto text-[10px] font-semibold uppercase tracking-wide ${
                    confTone[ins.confidence] ?? ""
                  }`}
                >
                  {ins.confidence}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
                {ins.body}
              </p>
              <div className="mt-2 border-t border-[var(--color-line)] pt-2 text-[10px] text-[var(--color-ink-soft)]">
                based on {fmtRange(ins)} · generated {fmtWhen(ins.generated_at)} ·{" "}
                {ins.generated_by}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Ask me</SectionLabel>
        <Card>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Ask me questions about interpreting your data. Answers use the{" "}
            <span className="font-medium text-[var(--color-ink)]">
              {rangeLabels[range].toLowerCase()}
            </span>{" "}
            range selected above.
          </p>

          <div ref={scroller} className="mb-3 max-h-72 space-y-2 overflow-y-auto">
            {messages.length === 0 && (
              <p className="py-6 text-center text-xs text-[var(--color-ink-soft)]">
                e.g. “Does my meal timing affect how I sleep?”
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${
                  m.role === "you" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "you"
                      ? "bg-[var(--color-teal)] text-white"
                      : "bg-[var(--color-surface-2)] text-[var(--color-ink)]"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
                  thinking…
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* artifact upload — present but disabled for now */}
            <button
              disabled
              title="Attach an artifact (coming soon)"
              className="shrink-0 rounded-lg border border-[var(--color-line)] p-2 text-[var(--color-ink-soft)] opacity-40"
              aria-label="Attach (disabled)"
            >
              <Paperclip size={16} />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about your data…"
              className={inputCls}
            />
            <button
              onClick={send}
              disabled={!draft.trim() || pending}
              className="shrink-0 rounded-lg bg-[var(--color-teal)] p-2 text-white disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </Card>
      </section>
    </div>
  );
}
