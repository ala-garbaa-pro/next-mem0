/**
 * Turn a Codex CLI session log ("rollout") into an importable conversation.
 *
 * Codex keeps one JSONL file per thread under ~/.codex/sessions/YYYY/MM/DD/. It starts with a
 * `session_meta` line and then logs `response_item` lines — the user / assistant messages we want,
 * plus reasoning, tool calls and `developer` prompts we drop. User turns also carry blocks Codex
 * injects itself (<environment_context>, <recommended_plugins>, AGENTS.md, <image> tags, …) which
 * are stripped here.
 *
 * The rows arrive from the user's machine through public/next-mem0-sync.mjs → /api/import/codex,
 * so this module is pure: no filesystem, no database.
 */
import type { ImportedConversation, NewMessage } from "./types";

/** What the sync program knows about a thread before uploading it. */
export interface CodexSessionMeta {
  /** Codex thread id — what `codex resume <id>` takes and what conversations.cliSessionId stores. */
  id: string;
  /** Name Codex gave the thread (session_index.jsonl), when it has one. */
  name?: string;
  cwd?: string;
  startedAt?: string;
  updatedAt?: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// ---------- user-turn cleanup ----------

/** Blocks Codex prepends to the user's own words; they never contain anything the user typed. */
const INJECTED_BLOCKS = ["environment_context", "recommended_plugins", "user_instructions", "turn_aborted"];

/** Sub-agent / voice hand-offs wrap the actual request in <input>. */
const DELEGATION_BLOCKS = ["codex_delegation", "realtime_delegation"];

/** Keep in sync with cleanUserText() in public/next-mem0-sync.mjs, which uses it for list titles. */
export function cleanUserText(raw: string): string {
  let text = raw;
  for (const tag of INJECTED_BLOCKS) {
    text = text.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g"), "");
  }
  for (const tag of DELEGATION_BLOCKS) {
    text = text.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g"), (block) => {
      const m = /<input>([\s\S]*?)<\/input>/.exec(block);
      return m ? m[1] : "";
    });
  }
  // Pasted screenshots: keep the "[Image #1]" references the user wrote, drop the file tags
  // (the opening tag, the image and "</image>" are separate content parts, joined by newlines).
  text = text.replace(/<image\b[^>]*>(?:\s*<\/image>)?/g, "");
  // Project AGENTS.md files are sent as a user turn: "# AGENTS.md instructions for <dir>\n<INSTRUCTIONS>…".
  text = text.replace(/^\s*# AGENTS\.md instructions for [^\n]*\n+<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/, "");
  // Attachments from the desktop app: "# Files mentioned by the user: … ## My request for Codex:\n<text>".
  const request = /^\s*# Files mentioned by the user:[\s\S]*?## My request for Codex:\n?/.exec(text);
  if (request) text = text.slice(request[0].length);
  return text.trim();
}

function contentText(content: unknown, kind: "input_text" | "output_text"): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is Json => obj(p) && p.type === kind)
    .map((p) => str(p.text))
    .join("\n");
}

// ---------- public API ----------

/**
 * Parse the rows of one rollout (every line, or only the session_meta / message ones — the sync
 * program sends the latter). Consecutive assistant messages of a turn (Codex's "commentary"
 * progress notes, then the final answer) are merged into one message, the way the chat panel
 * stores a streamed `codex exec` reply.
 */
export function parseCodexRows(
  rows: unknown[],
  meta: CodexSessionMeta,
): ImportedConversation & { cliSessionId: string } {
  const messages: NewMessage[] = [];
  let id = meta.id;
  let startedAt = meta.startedAt;
  for (const row of rows) {
    if (!obj(row) || !obj(row.payload)) continue;
    const p = row.payload;
    if (row.type === "session_meta") {
      id ||= str(p.id) || str(p.session_id);
      startedAt ||= str(p.timestamp) || undefined;
      continue;
    }
    if (row.type !== "response_item" || p.type !== "message") continue;
    const at = str(row.timestamp) || undefined;
    if (p.role === "user") {
      const content = cleanUserText(contentText(p.content, "input_text"));
      if (content) messages.push({ role: "user", content, createdAt: at });
    } else if (p.role === "assistant") {
      const content = contentText(p.content, "output_text").trim();
      if (!content) continue;
      const last = messages.at(-1);
      if (last?.role === "assistant") last.content += `\n\n${content}`;
      else messages.push({ role: "assistant", content, createdAt: at });
    }
  }
  if (!id) throw new Error("Not a Codex session: no thread id");
  const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
  return {
    title: meta.name?.trim() || firstUser.split("\n")[0].slice(0, 80) || "Untitled conversation",
    source: "codex",
    createdAt: startedAt,
    cliSessionId: id,
    messages,
  };
}
