/**
 * Parsers that turn exported chat data into ImportedConversation[].
 * Supported:
 *   - ChatGPT data export: conversations.json (array with `mapping` trees)
 *   - Claude.ai data export: conversations.json (array with `chat_messages`)
 *   - Generic: [{ title?, source?, messages: [{ role, content }] }] or a bare message array
 *   - Pasted transcripts: "User: ... / Assistant: ..." style text
 */
import { isRole, isSource, type ImportedConversation, type NewMessage, type Role, type Source } from "./types";

type Json = Record<string, unknown>;
const obj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const epochToIso = (v: unknown): string | undefined =>
  typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000).toISOString() : undefined;

// ---------- ChatGPT ----------

interface GptNode {
  id: string;
  parent?: string | null;
  children?: string[];
  message?: {
    author?: { role?: string };
    content?: { content_type?: string; parts?: unknown[]; text?: string };
    create_time?: number | null;
  } | null;
}

function chatgptRole(role: string | undefined): Role | null {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return null; // drop system/tool nodes
}

function parseChatGptConversation(c: Json): ImportedConversation | null {
  const mapping = c.mapping;
  if (!obj(mapping)) return null;
  const nodes = mapping as Record<string, GptNode>;

  // Walk from current_node up to the root to get the active branch.
  let cursor = str(c.current_node);
  if (!cursor || !nodes[cursor]) {
    // fall back: find a leaf
    cursor = Object.keys(nodes).find((k) => !(nodes[k].children?.length)) ?? "";
  }
  const chain: GptNode[] = [];
  const seen = new Set<string>();
  while (cursor && nodes[cursor] && !seen.has(cursor)) {
    seen.add(cursor);
    chain.push(nodes[cursor]);
    cursor = nodes[cursor].parent ?? "";
  }
  chain.reverse();

  const messages: NewMessage[] = [];
  for (const node of chain) {
    const m = node.message;
    if (!m) continue;
    const role = chatgptRole(m.author?.role);
    if (!role) continue;
    const content = m.content;
    let text = "";
    if (content?.content_type === "text" || content?.content_type === "multimodal_text") {
      text = (content.parts ?? []).filter((p): p is string => typeof p === "string").join("\n");
    } else if (typeof content?.text === "string") {
      text = content.text;
    }
    if (!text.trim()) continue;
    messages.push({ role, content: text, createdAt: epochToIso(m.create_time) });
  }
  if (!messages.length) return null;
  return {
    title: str(c.title) || "Untitled conversation",
    source: "chatgpt",
    createdAt: epochToIso(c.create_time),
    messages,
  };
}

// ---------- Claude.ai ----------

function parseClaudeConversation(c: Json): ImportedConversation | null {
  const chat = c.chat_messages;
  if (!Array.isArray(chat)) return null;
  const messages: NewMessage[] = [];
  for (const raw of chat) {
    if (!obj(raw)) continue;
    const role: Role = raw.sender === "human" ? "user" : "assistant";
    let text = str(raw.text);
    if (!text && Array.isArray(raw.content)) {
      text = raw.content
        .filter((p): p is Json => obj(p) && p.type === "text")
        .map((p) => str(p.text))
        .join("\n");
    }
    if (!text.trim()) continue;
    messages.push({ role, content: text, createdAt: str(raw.created_at) || undefined });
  }
  if (!messages.length) return null;
  return {
    title: str(c.name) || "Untitled conversation",
    source: "claude",
    createdAt: str(c.created_at) || undefined,
    messages,
  };
}

// ---------- Generic ----------

function parseGenericMessages(list: unknown[]): NewMessage[] {
  const out: NewMessage[] = [];
  for (const raw of list) {
    if (!obj(raw)) continue;
    const role = raw.role;
    const content = typeof raw.content === "string" ? raw.content : str(raw.text);
    if (!isRole(role) || !content.trim()) continue;
    out.push({ role, content });
  }
  return out;
}

function parseGenericConversation(c: Json, fallbackSource: Source): ImportedConversation | null {
  if (!Array.isArray(c.messages)) return null;
  const messages = parseGenericMessages(c.messages);
  if (!messages.length) return null;
  return {
    title: str(c.title) || str(c.name) || "Untitled conversation",
    source: isSource(c.source) ? c.source : fallbackSource,
    createdAt: str(c.createdAt) || str(c.created_at) || undefined,
    messages,
  };
}

// ---------- Entry point ----------

export function parseExport(jsonText: string, fallbackSource: Source = "other"): ImportedConversation[] {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("File is not valid JSON");
  }
  return parseExportData(data, fallbackSource);
}

/** Same as parseExport but for already-parsed JSON (e.g. a request body). */
export function parseExportData(data: unknown, fallbackSource: Source = "other"): ImportedConversation[] {
  // Bare message array
  if (Array.isArray(data) && data.length && obj(data[0]) && "role" in data[0] && !("mapping" in data[0])) {
    const messages = parseGenericMessages(data);
    return messages.length ? [{ title: "Imported conversation", source: fallbackSource, messages }] : [];
  }

  const list: unknown[] = Array.isArray(data) ? data : obj(data) && Array.isArray(data.conversations) ? data.conversations : [data];
  const out: ImportedConversation[] = [];
  for (const item of list) {
    if (!obj(item)) continue;
    const parsed =
      ("mapping" in item ? parseChatGptConversation(item) : null) ??
      ("chat_messages" in item ? parseClaudeConversation(item) : null) ??
      parseGenericConversation(item, fallbackSource);
    if (parsed) out.push(parsed);
  }
  return out;
}

// ---------- Pasted transcript ----------

const SPEAKER = /^\s*(?:[#*_>\-\s]*)(user|human|me|you|assistant|ai|claude|chatgpt|gpt|codex|gemini|model|system)\s*[:：]\s*(?:\*\*)?\s*/i;

function speakerRole(name: string): Role {
  const n = name.toLowerCase();
  if (["user", "human", "me", "you"].includes(n)) return "user";
  if (n === "system") return "system";
  return "assistant";
}

/**
 * Split a pasted transcript into messages. Lines like "User: ..." / "Assistant: ..." start a new
 * message; everything else is appended to the current one. If no speaker markers are found the
 * whole text becomes a single user message.
 */
export function parseTranscript(text: string): NewMessage[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const messages: NewMessage[] = [];
  let current: NewMessage | null = null;
  for (const line of lines) {
    const m = SPEAKER.exec(line);
    if (m) {
      if (current) messages.push(current);
      current = { role: speakerRole(m[1]), content: line.slice(m[0].length) };
    } else if (current) {
      current.content += "\n" + line;
    } else if (line.trim()) {
      current = { role: "user", content: line };
    }
  }
  if (current) messages.push(current);
  return messages.map((m) => ({ ...m, content: m.content.trim() })).filter((m) => m.content);
}
