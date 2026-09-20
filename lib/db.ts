/**
 * Conversation store on PostgreSQL + pgvector, through Drizzle (schema in lib/schema.ts).
 *   conversations — metadata (title, source, tags, cli session id, ...), owned by a user
 *   messages      — one row per message, with a nomic-embed-text vector for semantic search
 *
 * Every function takes the owning userId and only ever reads or writes that user's rows.
 */
import { and, asc, cosineDistance, desc, eq, inArray, sql } from "drizzle-orm";
import { db, describeDatabase, ready } from "./drizzle";
import { EMBED_DIM, EMBED_MODEL, embedDocuments, embedQuery } from "./embeddings";
import { conversations, messages } from "./schema";
import {
  isRole,
  isSource,
  type Conversation,
  type Message,
  type NewMessage,
  type SearchHit,
  type Source,
} from "./types";

/** Hits with cosine similarity below this are noise for nomic-embed-text; tune per model. */
const MIN_SIMILARITY = Number(process.env.NEXT_MEM0_MIN_SIMILARITY ?? 0.45);

const now = () => new Date();
const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const parseDate = (s: string | undefined, fallback: Date) => {
  const d = s ? new Date(s) : fallback;
  return Number.isNaN(d.getTime()) ? fallback : d;
};

// ---------- row mapping ----------

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = Omit<typeof messages.$inferSelect, "embedding">;

function toConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    title: r.title,
    source: isSource(r.source) ? r.source : "other",
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    cliSessionId: r.cliSessionId,
    messageCount: r.messageCount,
    preview: r.preview,
  };
}

function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    conversationId: r.conversationId,
    role: isRole(r.role) ? r.role : "user",
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    position: r.position,
  };
}

const MESSAGE_COLUMNS = {
  id: messages.id,
  conversationId: messages.conversationId,
  userId: messages.userId,
  role: messages.role,
  content: messages.content,
  createdAt: messages.createdAt,
  position: messages.position,
};

// ---------- conversations ----------

export async function listConversations(userId: string): Promise<Conversation[]> {
  await ready();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(10_000);
  return rows.map(toConversation);
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  if (!isUuid(id)) return null;
  await ready();
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  return row ? toConversation(row) : null;
}

export async function createConversation(
  userId: string,
  input: {
    id?: string;
    title?: string;
    source: Source;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
    cliSessionId?: string;
  },
): Promise<Conversation> {
  await ready();
  const created = parseDate(input.createdAt, now());
  const [row] = await db
    .insert(conversations)
    .values({
      id: input.id ?? crypto.randomUUID(),
      userId,
      title: input.title?.trim() || "Untitled conversation",
      source: input.source,
      tags: input.tags ?? [],
      createdAt: created,
      updatedAt: parseDate(input.updatedAt, created),
      cliSessionId: input.cliSessionId ?? "",
    })
    .returning();
  return toConversation(row);
}

export async function updateConversation(
  userId: string,
  id: string,
  values: Partial<{ title: string; tags: string[]; cliSessionId: string; source: Source }>,
): Promise<void> {
  await ready();
  const patch: Partial<typeof conversations.$inferInsert> = { updatedAt: now() };
  if (values.title !== undefined) patch.title = values.title.trim() || "Untitled conversation";
  if (values.tags !== undefined) patch.tags = values.tags;
  if (values.cliSessionId !== undefined) patch.cliSessionId = values.cliSessionId;
  if (values.source !== undefined) patch.source = values.source;
  await db
    .update(conversations)
    .set(patch)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await ready();
  // messages cascade
  await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

// ---------- messages ----------

export async function getMessages(userId: string, conversationId: string): Promise<Message[]> {
  if (!isUuid(conversationId)) return [];
  await ready();
  const rows = await db
    .select(MESSAGE_COLUMNS)
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.userId, userId)))
    .orderBy(asc(messages.position));
  return rows.map(toMessage);
}

/** Append messages to a conversation: embeds them, stores them, refreshes conversation metadata. */
export async function addMessages(userId: string, conversationId: string, input: NewMessage[]): Promise<Message[]> {
  const items = input.filter((m) => m.content.trim().length > 0);
  if (!items.length) return [];
  const convo = await getConversation(userId, conversationId);
  if (!convo) throw new Error("Conversation not found");
  const vectors = await embedDocuments(items.map((m) => `${m.role}: ${m.content}`));
  return insertMessages(convo, items, vectors);
}

/** Store already-embedded messages under `convo` (its owner is trusted; used by addMessages and restore). */
async function insertMessages(
  convo: Conversation & { userId?: string },
  items: (NewMessage & { id?: string; position?: number })[],
  vectors: number[][],
): Promise<Message[]> {
  if (!items.length) return [];
  await ready();
  const [owner] = await db
    .select({ userId: conversations.userId })
    .from(conversations)
    .where(eq(conversations.id, convo.id));
  if (!owner) throw new Error("Conversation not found");

  const ts = now();
  const rows: (typeof messages.$inferInsert)[] = items.map((m, i) => ({
    id: m.id ?? crypto.randomUUID(),
    conversationId: convo.id,
    userId: owner.userId,
    role: m.role,
    content: m.content,
    createdAt: parseDate(m.createdAt, ts),
    position: m.position ?? convo.messageCount + i,
    embedding: vectors[i],
  }));

  const firstUser = items.find((m) => m.role === "user") ?? items[0];
  const patch: Partial<typeof conversations.$inferInsert> = {
    messageCount: convo.messageCount + rows.length,
    updatedAt: ts,
  };
  if (!convo.preview) patch.preview = firstUser.content.trim().slice(0, 160);
  if (convo.title === "Untitled conversation") {
    patch.title = firstUser.content.trim().split("\n")[0].slice(0, 80);
  }

  await db.transaction(async (tx) => {
    // Insert in chunks so a huge import does not build one enormous statement.
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(messages).values(rows.slice(i, i + 200));
    }
    await tx.update(conversations).set(patch).where(eq(conversations.id, convo.id));
  });

  return rows.map((r) => toMessage({ ...r, createdAt: r.createdAt as Date }));
}

// ---------- search ----------

export async function searchMessages(userId: string, query: string, limit = 20): Promise<SearchHit[]> {
  const text = query.trim();
  if (!text) return [];
  await ready();
  const vector = await embedQuery(text);
  const distance = cosineDistance(messages.embedding, vector);
  const rows = await db
    .select({ ...MESSAGE_COLUMNS, distance: sql<number>`${distance}` })
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(distance)
    .limit(limit);
  const hits = rows.filter((r) => 1 - Number(r.distance) >= MIN_SIMILARITY);
  const ids = [...new Set(hits.map((r) => r.conversationId))];
  const convoRows = ids.length ? await db.select().from(conversations).where(inArray(conversations.id, ids)) : [];
  const convos = new Map(convoRows.map((r) => [r.id, toConversation(r)]));
  return hits.map((r) => ({
    ...toMessage(r),
    distance: Number(r.distance),
    conversation: convos.get(r.conversationId) ?? null,
  }));
}

export async function getStats(userId: string): Promise<{ conversations: number; messages: number; database: string }> {
  await ready();
  const [[c], [m]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.userId, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(messages).where(eq(messages.userId, userId)),
  ]);
  return { conversations: c.n, messages: m.n, database: describeDatabase() };
}

// ---------- backup: export / import everything ----------

export const BACKUP_FORMAT = "next-mem0-backup";

export interface BackupHeader {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  embedModel: string;
  embedDim: number;
  conversations: number;
  messages: number;
}

export interface BackupMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  position: number;
  /** Absent when exported with vectors=false; re-embedded on import. */
  embedding?: number[];
}

export interface BackupConversation extends Omit<Conversation, "messageCount" | "preview"> {
  messages: BackupMessage[];
}

export async function backupHeader(userId: string): Promise<BackupHeader> {
  const s = await getStats(userId);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: now().toISOString(),
    embedModel: EMBED_MODEL,
    embedDim: EMBED_DIM,
    conversations: s.conversations,
    messages: s.messages,
  };
}

/** Yields the user's conversations with their messages, oldest first. Vectors are rounded to 6 decimals. */
export async function* iterateBackup(userId: string, withVectors: boolean): AsyncGenerator<BackupConversation> {
  await ready();
  const convos = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(asc(conversations.createdAt), asc(conversations.id));
  for (const c of convos) {
    const rows = await db
      .select({ ...MESSAGE_COLUMNS, ...(withVectors ? { embedding: messages.embedding } : {}) })
      .from(messages)
      .where(eq(messages.conversationId, c.id))
      .orderBy(asc(messages.position));
    const convo = toConversation(c);
    yield {
      id: convo.id,
      title: convo.title,
      source: convo.source,
      tags: convo.tags,
      createdAt: convo.createdAt,
      updatedAt: convo.updatedAt,
      cliSessionId: convo.cliSessionId,
      messages: rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        position: r.position,
        ...("embedding" in r && Array.isArray(r.embedding)
          ? { embedding: (r.embedding as number[]).map((v) => Number(v.toFixed(6))) }
          : {}),
      })),
    };
  }
}

export interface RestoreResult {
  conversations: number;
  messages: number;
  reembedded: number;
  skipped: number;
}

/**
 * Import a backup produced by iterateBackup() into the user's store. A conversation whose id already
 * exists (for any user) is replaced only if it belongs to this user; otherwise it gets a new id.
 * Messages without a stored vector, or from a different embedding model, are re-embedded.
 */
export async function restoreBackup(
  userId: string,
  header: Partial<BackupHeader>,
  items: BackupConversation[],
  opts: { replaceAll?: boolean } = {},
): Promise<RestoreResult> {
  if (header.format !== BACKUP_FORMAT) throw new Error("Not a next-mem0 backup file");
  await ready();
  const sameModel = header.embedModel === EMBED_MODEL && Number(header.embedDim) === EMBED_DIM;
  if (opts.replaceAll) await db.delete(conversations).where(eq(conversations.userId, userId));

  const result: RestoreResult = { conversations: 0, messages: 0, reembedded: 0, skipped: 0 };
  for (const c of items) {
    if (!isSource(c.source) || typeof c.title !== "string") {
      result.skipped++;
      continue;
    }
    const msgs = (Array.isArray(c.messages) ? c.messages : [])
      .filter((m) => isRole(m.role) && typeof m.content === "string" && m.content.trim().length > 0)
      .map((m, i) => ({
        id: isUuid(m.id) ? m.id : crypto.randomUUID(),
        role: m.role as NewMessage["role"],
        content: m.content,
        createdAt: m.createdAt,
        position: Number.isInteger(m.position) ? m.position : i,
        embedding: m.embedding,
      }));

    const vectors: number[][] = [];
    const toEmbed: number[] = [];
    msgs.forEach((m, i) => {
      if (sameModel && Array.isArray(m.embedding) && m.embedding.length === EMBED_DIM) vectors[i] = m.embedding;
      else toEmbed.push(i);
    });
    if (toEmbed.length) {
      const fresh = await embedDocuments(toEmbed.map((i) => `${msgs[i].role}: ${msgs[i].content}`));
      toEmbed.forEach((i, k) => (vectors[i] = fresh[k]));
      result.reembedded += toEmbed.length;
    }

    // Reuse the exported id unless it collides with another user's conversation.
    let id = isUuid(c.id) ? c.id : crypto.randomUUID();
    const [existing] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, id));
    if (existing?.userId === userId) await deleteConversation(userId, id);
    else if (existing) id = crypto.randomUUID();
    // A message id from the file could also collide; drop ids that already exist.
    if (msgs.length) {
      const taken = new Set(
        (
          await db
            .select({ id: messages.id })
            .from(messages)
            .where(
              inArray(
                messages.id,
                msgs.map((m) => m.id),
              ),
            )
        ).map((r) => r.id),
      );
      for (const m of msgs) if (taken.has(m.id)) m.id = crypto.randomUUID();
    }

    const convo = await createConversation(userId, {
      id,
      title: c.title,
      source: c.source,
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === "string") : [],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      cliSessionId: typeof c.cliSessionId === "string" ? c.cliSessionId : "",
    });
    const inserted = await insertMessages(convo, msgs, vectors);
    // insertMessages bumps updated_at; put the exported value back.
    if (c.updatedAt) {
      await db
        .update(conversations)
        .set({ updatedAt: parseDate(c.updatedAt, now()) })
        .where(eq(conversations.id, id));
    }
    result.conversations++;
    result.messages += inserted.length;
  }
  return result;
}
