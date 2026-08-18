// Real Anthropic API call for insight generation. Runs client-side (this is
// a demo shortcut — see README's "LLM calls: backend-side only" principle;
// once a real backend exists, this whole module's job moves server-side and
// the key stops living in the browser bundle).
//
// Key: put ONE line in apps/web/.env.local (create it yourself, it's
// gitignored, Vite won't touch it otherwise):
//   VITE_ANTHROPIC_API_KEY=sk-ant-...

export type RawInsight = {
  title: string;
  body: string;
  confidence: "low" | "medium" | "high";
  confidenceReason: string;
  entityIds: string[];
};

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4000; // 1500 truncated mid-response for 5 insights — see chat history

// Free-text entity labels (from the model, or pasted external responses)
// normalized to the app's canonical entity ids, so chips render the same
// regardless of which source produced the insight.
export function normalizeEntityId(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("sleep")) return "sleep";
  if (s.includes("weight")) return "weight";
  if (s.includes("last meal") || s.includes("last_meal") || s.includes("meal")) return "last_meal";
  if (s.includes("water")) return "water";
  if (s.includes("breath")) return "breathing";
  if (s.includes("stretch")) return "stretches";
  if (s.includes("walk")) return "walking";
  if (s.includes("daily vibe") || s.includes("daily_vibe") || s.includes("vibe")) return "daily_vibe";
  if (s.includes("mood")) return "mood";
  return s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function insightToolSchema() {
  return {
    name: "return_insights",
    description: "Return the generated insights for the requested date range.",
    input_schema: {
      type: "object",
      properties: {
        insights: {
          type: "array",
          minItems: 2,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short descriptive title, under 10 words" },
              body: {
                type: "string",
                description:
                  "2-4 plain sentences, no markdown, no bullets. Ground every claim in the sketch numbers and quote them. Prefix each claim with 'Correlation:' or 'Hypothesis:'.",
              },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              confidence_reason: {
                type: "string",
                description:
                  "One sentence justifying the confidence rating using a specific number from the sketches.",
              },
              entity_ids: {
                type: "array",
                items: { type: "string" },
                description: "Entity names this insight draws on (e.g. 'sleep', 'weight', 'mood').",
              },
            },
            required: ["title", "body", "confidence", "confidence_reason", "entity_ids"],
          },
        },
      },
      required: ["insights"],
    },
  };
}

// Trailing content-guidance appended after the sketch dump. No "return ONLY
// JSON" plumbing needed — tool_choice enforces the shape structurally, this
// just guides what goes inside it.
export function promptInstructions(): string {
  return [
    "Based on the sketches above, call return_insights with between 2 and 5 insights",
    "— however many the data actually supports. For each insight:",
    "",
    "- Ground every claim in the numbers above and quote them.",
    "- Explicitly prefix each claim with \"Correlation:\" or \"Hypothesis:\" — never",
    "  assert causation.",
    "- confidence_reason must justify the confidence rating using a specific",
    "  number from the sketches (sample size, or how small a trend delta is",
    "  relative to its sd).",
    "- If the range holds too little data overall to support any trustworthy",
    "  claim, call return_insights with a single insight titled \"Not enough to",
    "  say yet\", confidence \"low\", and a body explaining why.",
  ].join("\n");
}

// A readable (not the literal request body) rendering of the forced-tool
// mechanism, for the demo's prompt-preview box — shows the audience that
// this isn't free-text generation, it's schema-constrained.
export function toolSchemaDisplay(): string {
  return [
    "--- forced structured output ---",
    `model: ${MODEL}`,
    `tool_choice: { type: "tool", name: "return_insights" }`,
    "",
    "tool return_insights(insights: Array<{",
    "  title: string,",
    "  body: string,               // 2-4 sentences, Correlation:/Hypothesis: prefixed",
    "  confidence: low|medium|high,",
    "  confidence_reason: string,  // must cite a specific sketch number",
    "  entity_ids: string[],",
    "}>)  // 2-5 items required",
  ].join("\n");
}

export class AnthropicCallError extends Error {}

export async function generateInsightsFromAnthropic(promptText: string): Promise<RawInsight[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    throw new AnthropicCallError(
      "No Anthropic API key found. Create apps/web/.env.local with one line: VITE_ANTHROPIC_API_KEY=sk-ant-..."
    );
  }

  const fullPrompt = promptText;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: fullPrompt }],
        tools: [insightToolSchema()],
        tool_choice: { type: "tool", name: "return_insights" },
      }),
    });
  } catch (e) {
    throw new AnthropicCallError(
      `Network error calling Anthropic — check connectivity. (${e instanceof Error ? e.message : e})`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AnthropicCallError(`Anthropic API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();

  if (data.stop_reason === "max_tokens") {
    throw new AnthropicCallError(
      "Response was truncated (hit max_tokens) before finishing — try a narrower range, or raise MAX_TOKENS in lib/anthropic.ts."
    );
  }

  const toolUse = (data.content ?? []).find((b: any) => b.type === "tool_use");
  const rawInsights = toolUse?.input?.insights;
  if (!Array.isArray(rawInsights) || rawInsights.length === 0) {
    throw new AnthropicCallError("Model response didn't include a valid insights array.");
  }

  return rawInsights.map((r: any) => ({
    title: String(r.title ?? "Untitled"),
    body: String(r.body ?? ""),
    confidence: (["low", "medium", "high"].includes(r.confidence) ? r.confidence : "low") as
      | "low"
      | "medium"
      | "high",
    confidenceReason: String(r.confidence_reason ?? ""),
    entityIds: Array.isArray(r.entity_ids) ? r.entity_ids.map((e: string) => normalizeEntityId(String(e))) : [],
  }));
}
