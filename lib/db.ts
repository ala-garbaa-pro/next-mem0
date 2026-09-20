/**
 * Local vector store for conversation history, backed by LanceDB (embedded, on disk).
 * Two tables:
 *   conversations — metadata (title, source, tags, cli session id, ...)
 *   messages      — one row per message, with a nomic-embed-text vector for semantic search
 */
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type * as LanceDB from "@lancedb/lancedb";
import { Field, FixedSizeList, Float32, Int32, Schema, Utf8 } from "apache-arrow";
import { EMBED_DIM, embedDocuments, embedQuery } from "./embeddings";
import {
  isRole,
  isSource,
  type Conversation,
  type Message,
  type NewMessage,
  type SearchHit,
  type Source,
} from "./types";

// LanceDB is a native N-API module. Loading it through the project's own require() keeps the
// bundler (Turbopack) out of the picture entirely; the runtime resolves it from node_modules.
const lancedb: typeof LanceDB = createRequire(path.join(process.cwd(), "package.json"))("@lancedb/lancedb");

export const DB_PATH = process.env.MEM0_DB_PATH ?? path.join(process.cwd(), "data", "lancedb");
/** Hits with cosine similarity below this are noise for nomic-embed-text; tune per model. */
const MIN_SIMILARITY = Number(process.env.MEM0_MIN_SIMILARITY ?? 0.45);

const conversationSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("title", new Utf8(), false),
  new Field("source", new Utf8(), false),
  new Field("tags", new Utf8(), false), // JSON-encoded string[]
  new Field("created_at", new Utf8(), false),
  new Field("updated_at", new Utf8(), false),
  new Field("cli_session_id", new Utf8(), false),
  new Field("message_count", new Int32(), false),
  new Field("preview", new Utf8(), false),
]);

const messageSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("conversation_id", new Utf8(), false),
  new Field("role", new Utf8(), false),
  new Field("content", new Utf8(), false),
  new Field("created_at", new Utf8(), false),
  new Field("position", new Int32(), false),
  new Field("vector", new FixedSizeList(EMBED_DIM, new Field("item", new Float32(), true)), false),
]);

const MESSAGE_COLUMNS = ["id", "conversation_id", "role", "content", "created_at", "position"];

interface Store {
  db: LanceDB.Connection;
  conversations: LanceDB.Table;
  messages: LanceDB.Table;
}

// Survive HMR in dev: keep one connection on globalThis.
const g = globalThis as unknown as { __mem0Store?: Promise<Store> };

async function openStore(): Promise<Store> {
  await fs.mkdir(DB_PATH, { recursive: true });
  // readConsistencyInterval 0 = always see writes from other processes (scripts, an MCP server, ...).
  const db = await lancedb.connect(DB_PATH, { readConsistencyInterval: 0 });
  const names = await db.tableNames();
  const conversations = names.includes("conversations")
    ? await db.openTable("conversations")
    : await db.createEmptyTable("conversations", conversationSchema);
  const messages = names.includes("messages")
    ? await db.openTable("messages")
    : await db.createEmptyTable("messages", messageSchema);
  return { db, conversations, messages };
}

export function getStore(): Promise<Store> {
  g.__mem0Store ??= openStore().catch((err) => {
    g.__mem0Store = undefined;
    throw err;
  });
  return g.__mem0Store;
}

/** Quote a string for a LanceDB SQL predicate. */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const now = () => new Date().toISOString();

// ---------- row mapping ----------

type ConversationRow = {
  id: string;
  title: string;
  source: string;
  tags: string;
  created_at: string;
  updated_at: string;
  cli_session_id: string;
  message_count: number;
  preview: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  position: number;
  _distance?: number;
};

function toConversation(r: ConversationRow): Conversation {
  let tags: string[] = [];
  try {
    tags = JSON.parse(r.tags || "[]");
  } catch {
    /* ignore bad json */
  }
  return {
    id: r.id,
    title: r.title,
    source: isSource(r.source) ? r.source : "other",
    tags,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    cliSessionId: r.cli_session_id ?? "",
    messageCount: Number(r.message_count ?? 0),
    preview: r.preview ?? "",
  };
}

function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: isRole(r.role) ? r.role : "user",
    content: r.content,
    createdAt: r.created_at,
    position: Number(r.position),
  };
}

// ---------- conversations ----------

export async function listConversations(): Promise<Conversation[]> {
  const { conversations } = await getStore();
  const rows = (await conversations.query().limit(10_000).toArray()) as ConversationRow[];
  return rows.map(toConversation).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const { conversations } = await getStore();
  const rows = (await conversations
    .query()
    .where(`id = ${q(id)}`)
    .limit(1)
    .toArray()) as ConversationRow[];
  return rows[0] ? toConversation(rows[0]) : null;
}

async function getConversationsByIds(ids: string[]): Promise<Map<string, Conversation>> {
  const map = new Map<string, Conversation>();
  if (!ids.length) return map;
  const { conversations } = await getStore();
  const rows = (await conversations
    .query()
    .where(`id IN (${ids.map(q).join(", ")})`)
    .limit(ids.length)
    .toArray()) as ConversationRow[];
  for (const r of rows) map.set(r.id, toConversation(r));
  return map;
}

export async function createConversation(input: {
  title?: string;
  source: Source;
  tags?: string[];
  createdAt?: string;
  cliSessionId?: string;
}): Promise<Conversation> {
  const { conversations } = await getStore();
  const ts = input.createdAt ?? now();
  const row: ConversationRow = {
    id: crypto.randomUUID(),
    title: input.title?.trim() || "Untitled conversation",
    source: input.source,
    tags: JSON.stringify(input.tags ?? []),
    created_at: ts,
    updated_at: ts,
    cli_session_id: input.cliSessionId ?? "",
    message_count: 0,
    preview: "",
  };
  await conversations.add([row]);
  return toConversation(row);
}

export async function updateConversation(
  id: string,
  values: Partial<{ title: string; tags: string[]; cliSessionId: string; source: Source }>,
): Promise<void> {
  const { conversations } = await getStore();
  const patch: Record<string, string> = { updated_at: now() };
  if (values.title !== undefined) patch.title = values.title.trim() || "Untitled conversation";
  if (values.tags !== undefined) patch.tags = JSON.stringify(values.tags);
  if (values.cliSessionId !== undefined) patch.cli_session_id = values.cliSessionId;
  if (values.source !== undefined) patch.source = values.source;
  await conversations.update({ where: `id = ${q(id)}`, values: patch });
}

export async function deleteConversation(id: string): Promise<void> {
  const { conversations, messages } = await getStore();
  await messages.delete(`conversation_id = ${q(id)}`);
  await conversations.delete(`id = ${q(id)}`);
}

// ---------- messages ----------

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { messages } = await getStore();
  const rows = (await messages
    .query()
    .where(`conversation_id = ${q(conversationId)}`)
    .select(MESSAGE_COLUMNS)
    .limit(100_000)
    .toArray()) as MessageRow[];
  return rows.map(toMessage).sort((a, b) => a.position - b.position);
}

/** Append messages to a conversation: embeds them, stores them, refreshes conversation metadata. */
export async function addMessages(conversationId: string, input: NewMessage[]): Promise<Message[]> {
  const items = input.filter((m) => m.content.trim().length > 0);
  if (!items.length) return [];
  const { conversations, messages } = await getStore();
  const convo = await getConversation(conversationId);
  if (!convo) throw new Error("Conversation not found");

  const vectors = await embedDocuments(items.map((m) => `${m.role}: ${m.content}`));
  const ts = now();
  const rows = items.map((m, i) => ({
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    role: m.role,
    content: m.content,
    created_at: m.createdAt ?? ts,
    position: convo.messageCount + i,
    vector: vectors[i],
  }));
  await messages.add(rows);

  const firstUser = items.find((m) => m.role === "user") ?? items[0];
  const patch: Record<string, string | number> = {
    message_count: convo.messageCount + rows.length,
    updated_at: ts,
  };
  if (!convo.preview) patch.preview = firstUser.content.trim().slice(0, 160);
  if (convo.title === "Untitled conversation") {
    patch.title = firstUser.content.trim().split("\n")[0].slice(0, 80);
  }
  await conversations.update({ where: `id = ${q(conversationId)}`, values: patch });

  return rows.map(toMessage);
}

// ---------- search ----------

export async function searchMessages(query: string, limit = 20): Promise<SearchHit[]> {
  const text = query.trim();
  if (!text) return [];
  const { messages } = await getStore();
  const vector = await embedQuery(text);
  const allRows = (await messages
    .vectorSearch(vector)
    .distanceType("cosine")
    .select([...MESSAGE_COLUMNS, "_distance"])
    .limit(limit)
    .toArray()) as MessageRow[];
  const rows = allRows.filter((r) => 1 - (r._distance ?? 0) >= MIN_SIMILARITY);
  const convos = await getConversationsByIds([...new Set(rows.map((r) => r.conversation_id))]);
  return rows.map((r) => ({
    ...toMessage(r),
    distance: r._distance ?? 0,
    conversation: convos.get(r.conversation_id) ?? null,
  }));
}

export async function getStats(): Promise<{ conversations: number; messages: number; dbPath: string }> {
  const { conversations, messages } = await getStore();
  const [c, m] = await Promise.all([conversations.countRows(), messages.countRows()]);
  return { conversations: c, messages: m, dbPath: DB_PATH };
}
