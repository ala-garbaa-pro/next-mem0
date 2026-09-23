/**
 * Turn an Antigravity conversation — the Gemini CLI (`agy`) and its IDE — into an importable
 * conversation.
 *
 * Antigravity keeps one SQLite database per conversation under ~/.gemini/<surface>/conversations/,
 * where <surface> is antigravity-cli, antigravity-ide or antigravity. Its `steps` table holds the
 * turns as protobuf blobs with no schema shipped alongside, so the text is addressed by field
 * number through lib/protobuf.ts. The numbers below were read off real conversations from all
 * three surfaces; see STEP_* for what each kind of step is.
 *
 * The rows arrive from the user's machine through public/next-mem0-sync.mjs → /api/import/gemini-cli,
 * so this module is pure: no filesystem, no database, no SQLite.
 */
import { firstAtPath, protoStrings } from "./protobuf";
import type { ImportedConversation, NewMessage } from "./types";

/** What the sync program knows about a conversation before uploading it. */
export interface AntigravitySessionMeta {
  /** Antigravity's conversation id — the database's own name, kept so re-imports can be matched. */
  id: string;
  name?: string;
  cwd?: string;
  startedAt?: string;
  updatedAt?: string;
}

/** One row of the `steps` table, as the sync program sends it. */
export interface AntigravityStep {
  idx: number;
  stepType: number;
  /** The step_payload blob, base64 so it survives JSON. */
  payload: string;
}

/**
 * The step kinds that carry the conversation. Everything else in the table is machinery: tool
 * calls and their results, plans, and two kinds of injected text that read like the user but are
 * not — an <EPHEMERAL_MESSAGE> the harness writes (90) and a "# Conversation History" digest of
 * earlier chats (98). Importing those would put words in the user's mouth, so only 14 and 15 are
 * read and every other step_type is ignored.
 */
const STEP_USER = 14;
const STEP_ASSISTANT = 15;

/** Where the text sits inside each kind of step, best path first. */
const USER_PATHS = ["19.2", "19.3.1"] as const;
const ASSISTANT_PATHS = ["20.1", "20.8"] as const;

/**
 * Strip the control characters that survive a round trip through a binary format. NUL matters
 * most: Postgres rejects it outright in a text column, so a single one anywhere in a conversation
 * fails the whole import. Real ones do turn up — a paste that carried them is stored verbatim by
 * Antigravity — so they are dropped here rather than left to break the insert.
 */
function stripControl(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/** Text Antigravity wraps around the user's own words. */
function cleanUserText(raw: string): string {
  let text = stripControl(raw);
  // The harness narrates the environment in a block that is not part of the question.
  text = text.replace(/<EPHEMERAL_MESSAGE>[\s\S]*?<\/EPHEMERAL_MESSAGE>/g, "");
  text = text.replace(/^\s*# Conversation History[\s\S]*$/, "");
  return text.trim();
}

function decodePayload(base64: string): Uint8Array {
  // Buffer is available in the Next.js runtime; atob would mangle the high bytes of a protobuf.
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Parse the steps of one conversation. Consecutive assistant steps are merged: a single answer is
 * split across steps whenever a tool call interrupts it, and the steps in between carry no text of
 * their own, so what survives is one reply in several pieces.
 */
export function parseAntigravitySteps(
  steps: AntigravityStep[],
  meta: AntigravitySessionMeta,
): ImportedConversation & { cliSessionId: string } {
  const messages: NewMessage[] = [];

  for (const step of steps) {
    if (step.stepType !== STEP_USER && step.stepType !== STEP_ASSISTANT) continue;
    let strings: Map<string, string[]>;
    try {
      strings = protoStrings(decodePayload(step.payload));
    } catch {
      continue; // a step we cannot read is skipped rather than failing the whole import
    }

    if (step.stepType === STEP_USER) {
      const content = cleanUserText(firstAtPath(strings, USER_PATHS));
      if (content) messages.push({ role: "user", content });
    } else {
      const content = stripControl(firstAtPath(strings, ASSISTANT_PATHS)).trim();
      if (!content) continue; // an intermediate tool-calling step carries no prose
      const last = messages.at(-1);
      if (last?.role === "assistant") last.content += `\n\n${content}`;
      else messages.push({ role: "assistant", content });
    }
  }

  if (!meta.id) throw new Error("Not an Antigravity conversation: no id");
  const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
  return {
    title: meta.name?.trim() || firstUser.split("\n")[0].slice(0, 80) || "Untitled conversation",
    source: "gemini",
    createdAt: meta.startedAt,
    cliSessionId: meta.id,
    messages,
  };
}
