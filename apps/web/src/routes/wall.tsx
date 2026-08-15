import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bookmark, Plus, ExternalLink } from "lucide-react";
import { Card, SectionLabel, inputCls } from "../components/ui";

export const Route = createFileRoute("/wall")({
  component: Wall,
});

type Item = { id: string; title: string; url: string };

function Wall() {
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const add = () => {
    if (!title.trim()) return;
    setItems((xs) => [{ id: crypto.randomUUID(), title, url }, ...xs]);
    setTitle("");
    setUrl("");
  };

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
          Saved
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold">
          Wall
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Useful links and references tied to your strides.
        </p>
      </header>

      <Card className="mb-6">
        <SectionLabel>Add a bookmark</SectionLabel>
        <div className="space-y-2">
          <input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
          <input
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputCls}
          />
          <button
            onClick={add}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} /> Save
          </button>
        </div>
      </Card>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-line)] px-4 py-10 text-center text-sm text-[var(--color-ink-soft)]">
          <Bookmark size={20} className="mx-auto mb-2 text-[var(--color-ink-soft)]" />
          Nothing saved yet. Add your first reference above.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id}>
              <a
                href={it.url || undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 transition hover:border-[var(--color-teal)]"
              >
                <Bookmark size={16} className="shrink-0 text-[var(--color-teal)]" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {it.title}
                </span>
                {it.url && (
                  <ExternalLink size={14} className="shrink-0 text-[var(--color-ink-soft)]" />
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
