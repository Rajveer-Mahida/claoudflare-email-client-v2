// Claude (Messages API) helpers — raw fetch, no SDK dependency.

import type { Env } from "./env";
import type { MessageRow } from "@email/shared";
import { getThread } from "./db";

const DEFAULT_MODEL = "claude-haiku-4-5";

type ClaudeResponse = {
  stop_reason?: string;
  content?: { type: string; text?: string }[];
  error?: { message?: string };
};

/** Call the Claude Messages API. Returns the assistant text (throws on error/refusal). */
export async function callClaude(
  env: Env,
  opts: { system: string; user: string; maxTokens: number; schema?: object },
): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("AI_NOT_CONFIGURED");

  const body: Record<string, unknown> = {
    model: env.AI_MODEL || DEFAULT_MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  };
  if (opts.schema) {
    body.output_config = { format: { type: "json_schema", schema: opts.schema } };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as ClaudeResponse;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Claude API ${res.status}`);
  }
  if (data.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }
  const text = (data.content ?? []).find((b) => b.type === "text")?.text ?? "";
  if (!text.trim()) throw new Error("Empty response from model.");
  return text;
}

/** Build a bounded plain-text rendering of a thread for the model. */
export async function threadText(
  db: D1Database,
  message: MessageRow,
  owner: string | null,
): Promise<string> {
  const threadKey = message.thread_id ?? message.message_id ?? message.id;
  const thread = await getThread(db, threadKey, owner);
  const msgs = thread.length ? thread : [message];

  const parts: string[] = [];
  let total = 0;
  for (const m of msgs) {
    const who = m.direction === "out" ? "You" : m.from_name?.trim() || m.from_addr;
    const text = (m.text ?? "").replace(/\s+\n/g, "\n").trim().slice(0, 2000);
    const block = `From: ${who}\nSubject: ${m.subject ?? ""}\n\n${text}`;
    total += block.length;
    parts.push(block);
    if (total > 12000) break;
  }
  return parts.join("\n\n---\n\n");
}
