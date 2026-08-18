import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Wand2, Paperclip } from "lucide-react";
import { api, type GenerateParams, type Insight } from "../lib/api";
import {
  Card,
  SectionLabel,
  inputCls,
  RangePicker,
  defaultRangeValue,
  type RangeValue,
} from "../components/ui";

export const Route = createFileRoute("/insights")({ component: Insights });

type Msg = { role: "you" | "stride"; text: string };

function toParams(v: RangeValue): GenerateParams {
  return { from: v.from, to: v.to };
}

function rangeDescription(v: RangeValue): string {
  if (v.mode === "30d") return "last 30 days";
  if (v.mode === "60d") return "last 60 days";
  return `${v.from} – ${v.to}`;
}

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

// Types text into the gray box a chunk at a time, so it visibly "streams
// in" rather than appearing instantly.
async function typeInto(
  fullText: string,
  onUpdate: (partial: string) => void,
  opts: { chunkSize?: number; delayMs?: number } = {}
) {
  const chunkSize = opts.chunkSize ?? 14;
  const delayMs = opts.delayMs ?? 12;
  let shown = "";
  for (let i = 0; i < fullText.length; i += chunkSize) {
    shown += fullText.slice(i, i + chunkSize);
    onUpdate(shown);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  onUpdate(fullText);
}

// The real call takes ~20-35s (a genuine Anthropic round trip) — this keeps
// the wait from reading as "did it hang?" with rotating status text and a
// bouncing-dots indicator, rather than a frozen button.
const WAIT_MESSAGES = [
  "Reasoning over your sketches…",
  "Cross-referencing sleep, meals, and mood…",
  "Checking correlations against the numbers…",
  "Grounding each claim before writing it down…",
  "Still working — real model calls take a bit…",
];

function WaitingIndicator() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % WAIT_MESSAGES.length), 4000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 py-1 text-xs text-[var(--color-ink-soft)]">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-teal)] [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-teal)] [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-teal)]" />
      </span>
      {WAIT_MESSAGES[i]}
    </div>
  );
}

function Insights() {
  const [range, setRange] = useState<RangeValue>(defaultRangeValue("60d"));
  const [insights, setInsights] = useState<Insight[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [waiting, setWaiting] = useState(false); // slow (real API) phase specifically
  const [promptText, setPromptText] = useState("");

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
    setWaiting(false);
    setError(null);
    setPromptText(""); // clear the box — each click re-types from scratch
    try {
      // Phase 1 — fast, local: real sketches, no LLM call. Types immediately.
      const { prompt, toolSchemaDisplay } = await api.previewPrompt(toParams(range));
      await typeInto(`${prompt}\n\n${toolSchemaDisplay}`, setPromptText);

      // Phase 2 — slow, real: the actual Anthropic call (~20-35s).
      setWaiting(true);
      const { insights: fresh } = await api.generateInsights(toParams(range));
      // prepend the new batch above whatever's already stored, newest first
      setInsights((prev) => [...fresh, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
      setWaiting(false);
    }
  };

  const send = async () => {
    const q = draft.trim();
    if (!q || pending) return;
    setMessages((m) => [...m, { role: "you", text: q }]);
    setDraft("");
    setPending(true);
    try {
      const { reply } = await api.chat(q, toParams(range));
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
      <div className="mb-6">
        <RangePicker value={range} onChange={setRange} />
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
            {waiting ? "Waiting on model…" : generating ? "Generating…" : "Generate top insights"}
          </button>
        </div>

        {/* prompt preview — the exact text + forced tool schema sent to the
            LLM. Separate from the insights scroll below. */}
        {(generating || promptText) && (
          <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3">
            <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--color-ink-soft)]">
              {promptText}
              {generating && !waiting && <span className="animate-pulse">▌</span>}
            </pre>
            {waiting && <WaitingIndicator />}
          </div>
        )}

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
              <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[var(--color-line)] pt-2">
                {ins.entityIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[9px] font-medium text-[var(--color-ink-soft)]"
                  >
                    {id}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-[var(--color-ink-soft)]">
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
              {rangeDescription(range)}
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
