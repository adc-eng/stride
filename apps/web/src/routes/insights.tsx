import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { api, type Insight } from "../lib/api";
import { Card, SectionLabel, inputCls } from "../components/ui";

export const Route = createFileRoute("/insights")({ component: Insights });

type Msg = { role: "you" | "stride"; text: string };

function Insights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listInsights()
      .then(setInsights)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load insights")
      );
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, pending]);

  const send = async () => {
    const q = draft.trim();
    if (!q || pending) return;
    setMessages((m) => [...m, { role: "you", text: q }]);
    setDraft("");
    setPending(true);
    try {
      const { reply } = await api.ask(q);
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
      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
          What your data suggests
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold">
          Insights
        </h1>
      </header>

      {error && (
        <p className="mb-4 text-sm text-[var(--color-clay)]">({error})</p>
      )}

      <section className="mb-8">
        <SectionLabel>Nightly reflections</SectionLabel>
        <div className="space-y-3">
          {insights.map((ins) => (
            <Card key={ins.id}>
              <div className="mb-1 flex items-center gap-2">
                <Sparkles size={15} className="text-[var(--color-teal)]" />
                <h3 className="text-sm font-semibold">{ins.title}</h3>
                <span className="ml-auto rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
                  {ins.confidence}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
                {ins.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Ask me</SectionLabel>
        <Card>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Ask me questions about interpreting your data.
          </p>

          <div
            ref={scroller}
            className="mb-3 max-h-72 space-y-2 overflow-y-auto"
          >
            {messages.length === 0 && (
              <p className="py-6 text-center text-xs text-[var(--color-ink-soft)]">
                e.g. "Does my meal timing affect how I sleep?"
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
