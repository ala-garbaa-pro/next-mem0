/**
 * Turn a Claude Code CLI session log into an importable conversation.
 *
 * Claude Code keeps one JSONL file per session under ~/.claude/projects/<cwd-slug>/<session-id>.jsonl.
 * Every line is a row with a `type`: the `user` / `assistant` rows carry the messages we want, and
 * around them sit rows we drop — `attachment`, `system`, `file-history-snapshot`, `queue-operation`,
 * `mode`, `permission-mode` — plus `ai-title` / `summary` / `last-prompt`, which only give a title.
 *
 * Inside a message there is more to drop: assistant turns carry `thinking` and `tool_use` blocks,
 * user turns carry `tool_result` blocks and the text Claude Code injects itself (system reminders,
 * slash-command scaffolding, command output).
 *
 * The rows arrive from the user's machine through public/next-mem0-sync.mjs → /api/import/claude-code,
 * so this module is pure: no filesystem, no database.
 */
import type { ImportedConversation, NewMessage } from "./types";

/** What the sync program knows about a session before uploading it. */
export interface ClaudeSessionMeta {
  /** Claude Code session id — what `claude --resume <id>` takes and what conversations.cliSessionId stores. */
  id: string;
  /** Title Claude Code generated for the session (an `ai-title` row), when it has one. */
  name?: string;
  cwd?: string;
  startedAt?: string;
  updatedAt?: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// ---------- user-turn cleanup ----------

/**
 * Blocks Claude Code prepends to the user's own words; they never contain anything the user typed.
 * `system-reminder` is the big one — CLAUDE.md, git status and the tool notices are all delivered
 * inside it, on nearly every turn.
 */
const INJECTED_BLOCKS = [
  "system-reminder",
  "command-message",
  "local-command-stdout",
  "local-command-stderr",
  "ide_selection",
  "ide_opened_file",
];

/** Keep in sync with cleanUserText() in public/next-mem0-sync.mjs, which uses it for list titles. */
export function cleanUserText(raw: string): string {
  let text = raw;
  for (const tag of INJECTED_BLOCKS) {
    text = text.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g"), "");
  }
  // A slash command is logged as scaffolding, not as what the user typed. Put it back together:
  // <command-name>/review</command-name><command-args>--fix</command-args> → "/review --fix".
  text = text.replace(
    /<command-name>([\s\S]*?)<\/command-name>(?:\s*<command-args>([\s\S]*?)<\/command-args>)?/g,
    (_all, name: string, args: string | undefined) => `${name.trim()} ${(args ?? "").trim()}`.trim(),
  );
  // Pasted or attached files: keep the reference the user wrote, drop the expanded body.
  text = text.replace(/<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content>/g, "");
  return text.trim();
}

/**
 * Text of one message. Claude Code writes `content` either as a bare string (the common case for a
 * typed user turn) or as an array of blocks; only `text` blocks survive, so `thinking`, `tool_use`,
 * `tool_result` and `image` all fall away here.
 */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is Json => obj(p) && p.type === "text")
    .map((p) => str(p.text))
    .join("\n");
}

/** Rows that are bookkeeping rather than conversation. */
function isSkippable(row: Json): boolean {
  // Sub-agent transcripts: a whole second conversation the user never saw in their own thread.
  if (row.isSidechain === true) return true;
  // Context Claude Code injected as if the user had said it.
  if (row.isMeta === true) return true;
  // A compact boundary restates the conversation so far; importing it duplicates everything.
  if (row.isCompactSummary === true) return true;
  return false;
}

/** A whole turn that is nothing but a slash command: "/model", "/clear", "/review --fix". */
const ONLY_A_COMMAND = /^\/[\w:.-]+(?:[ \t]+[^\n]*)?$/;

/**
 * Drop the local commands — `/model`, `/clear`, `/login` — which the model never sees: Claude Code
 * runs them itself and logs the result as `<local-command-stdout>`, so they are not part of the
 * conversation and only add noise to the archive.
 *
 * A slash command that *is* a prompt (a skill, a custom command) is answered by the model, so the
 * test is what follows the turn rather than how it is written: a command with an assistant reply
 * after it stays, one without goes.
 */
function dropLocalCommands(messages: NewMessage[]): NewMessage[] {
  return messages.filter((m, i) => {
    if (m.role !== "user" || !ONLY_A_COMMAND.test(m.content)) return true;
    return messages[i + 1]?.role === "assistant";
  });
}

// ---------- public API ----------

/**
 * Parse the rows of one session (every line, or only the ones the sync program keeps).
 *
 * Consecutive assistant rows are merged into one message: Claude Code splits a single turn across
 * rows whenever a tool call interrupts it, and once the tool blocks are dropped what remains is one
 * answer in several pieces. The same merge is what the chat panel does with a streamed reply.
 */
export function parseClaudeRows(
  rows: unknown[],
  meta: ClaudeSessionMeta,
): ImportedConversation & { cliSessionId: string } {
  const messages: NewMessage[] = [];
  let id = meta.id;
  let startedAt = meta.startedAt;
  let name = meta.name;

  for (const row of rows) {
    if (!obj(row)) continue;
    id ||= str(row.sessionId);
    // The title Claude Code generated; the last one wins, as it is rewritten as the chat grows.
    if (row.type === "ai-title") {
      name = str(row.aiTitle).trim() || name;
      continue;
    }
    if (row.type === "summary") {
      name ||= str(row.summary).trim() || undefined;
      continue;
    }
    if (row.type !== "user" && row.type !== "assistant") continue;
    if (isSkippable(row)) continue;
    if (!obj(row.message)) continue;

    const at = str(row.timestamp) || undefined;
    startedAt ||= at;

    if (row.type === "user") {
      const content = cleanUserText(contentText(row.message.content));
      if (content) messages.push({ role: "user", content, createdAt: at });
    } else {
      const content = contentText(row.message.content).trim();
      if (!content) continue;
      const last = messages.at(-1);
      if (last?.role === "assistant") last.content += `\n\n${content}`;
      else messages.push({ role: "assistant", content, createdAt: at });
    }
  }

  if (!id) throw new Error("Not a Claude Code session: no session id");
  const kept = dropLocalCommands(messages);
  const firstUser = kept.find((m) => m.role === "user")?.content ?? "";
  return {
    // `source: "claude"` on purpose — /api/chat only resumes a CLI session when the conversation's
    // source equals the provider, and the provider for the `claude` CLI is "claude".
    title: name?.trim() || firstUser.split("\n")[0].slice(0, 80) || "Untitled conversation",
    source: "claude",
    createdAt: startedAt,
    cliSessionId: id,
    messages: kept,
  };
}
