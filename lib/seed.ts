/**
 * Seed accounts and conversations from a JSON file. Three shapes are accepted:
 *
 * 1. A seed file — hand-written, ids and vectors optional, everything gets embedded on the way in:
 *      {
 *        "user": { "email": "dev@example.com", "password": "password123", "name": "Dev" },   // optional
 *        "conversations": [
 *          { "title": "…", "source": "claude", "tags": ["css"], "createdAt": "2026-01-01T00:00:00Z",
 *            "messages": [{ "role": "user", "content": "…" }, { "role": "assistant", "content": "…" }] }
 *        ]
 *      }
 * 2. A users file (seed/users.json) — accounts only, created when missing:
 *      { "users": [ { "email": "…", "password": "…", "name": "…" }, … ] }
 * 3. A backup file from GET /api/backup (`format: "next-mem0-backup"`, `data: [...]`).
 *
 * The owning account is taken from opts.email, else the file's `user.email`; it is created when it
 * does not exist and a password is known (opts.password or the file's `user.password`).
 */
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { BACKUP_FORMAT, restoreBackup, type BackupConversation, type BackupHeader, type RestoreResult } from "./db";
import { db, ready } from "./drizzle";
import { user as userTable } from "./schema";
import { isRole, isSource, type NewMessage, type Source } from "./types";

export interface SeedUser {
  email: string;
  password?: string;
  name?: string;
}

export interface SeedConversation {
  id?: string;
  title: string;
  source: Source;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  cliSessionId?: string;
  messages: (NewMessage & { id?: string })[];
}

export interface SeedFile {
  user?: SeedUser;
  conversations: SeedConversation[];
}

export interface UsersFile {
  users: SeedUser[];
}

export interface SeedOptions {
  /** Account that will own the data; falls back to the file's `user.email`. */
  email?: string;
  /** Used only when the account has to be created; falls back to the file's `user.password`. */
  password?: string;
  /** Empty the account's store before seeding. */
  replace?: boolean;
}

export interface SeedResult extends RestoreResult {
  userId: string;
  email: string;
  createdUser: boolean;
}

const EMPTY: RestoreResult = { conversations: 0, messages: 0, reembedded: 0, skipped: 0 };

type BackupFile = Partial<BackupHeader> & { data: BackupConversation[] };

const isBackup = (v: unknown): v is BackupFile =>
  !!v && typeof v === "object" && (v as BackupFile).format === BACKUP_FORMAT && Array.isArray((v as BackupFile).data);
const isSeed = (v: unknown): v is SeedFile =>
  !!v && typeof v === "object" && Array.isArray((v as SeedFile).conversations);
const isUsers = (v: unknown): v is UsersFile => !!v && typeof v === "object" && Array.isArray((v as UsersFile).users);

/** Find the account by email, or create it through Better Auth when a password is available. */
export async function resolveSeedUser(
  email: string,
  opts: { password?: string; name?: string } = {},
): Promise<{ id: string; created: boolean }> {
  await ready();
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, normalized));
  if (existing) return { id: existing.id, created: false };
  if (!opts.password) throw new Error(`No account for ${normalized}. Pass a password to create it.`);
  const res = await auth.api.signUpEmail({
    body: { email: normalized, password: opts.password, name: opts.name ?? normalized.split("@")[0] },
  });
  return { id: res.user.id, created: true };
}

/** Turn a hand-written seed conversation into the backup shape restoreBackup() understands. */
function toBackupConversation(c: SeedConversation, i: number): BackupConversation {
  if (!isSource(c.source)) throw new Error(`conversations[${i}]: unknown source "${String(c.source)}"`);
  if (typeof c.title !== "string") throw new Error(`conversations[${i}]: title is required`);
  const msgs = Array.isArray(c.messages) ? c.messages : [];
  const createdAt = c.createdAt ?? new Date().toISOString();
  return {
    id: c.id ?? crypto.randomUUID(),
    title: c.title,
    source: c.source,
    tags: c.tags ?? [],
    createdAt,
    updatedAt: c.updatedAt ?? msgs.at(-1)?.createdAt ?? createdAt,
    cliSessionId: c.cliSessionId ?? "",
    messages: msgs.map((m, j) => {
      if (!isRole(m.role)) throw new Error(`conversations[${i}].messages[${j}]: unknown role "${String(m.role)}"`);
      return {
        id: m.id ?? crypto.randomUUID(),
        role: m.role,
        content: m.content,
        createdAt: m.createdAt ?? createdAt,
        position: j,
      };
    }),
  };
}

/** Seed one account. */
async function seedUser(
  fileUser: SeedUser | undefined,
  header: Partial<BackupHeader>,
  items: BackupConversation[],
  opts: SeedOptions,
): Promise<SeedResult> {
  const email = opts.email ?? fileUser?.email;
  if (!email) throw new Error("No user: pass opts.email or add a `user` block to the file");
  const { id: userId, created } = await resolveSeedUser(email, {
    password: opts.password ?? fileUser?.password,
    name: fileUser?.name,
  });
  const result = await restoreBackup(userId, header, items, { replaceAll: opts.replace });
  return { ...result, userId, email: email.trim().toLowerCase(), createdUser: created };
}

/** Seed from an already-parsed JSON value. One result per account touched. */
export async function seed(json: unknown, opts: SeedOptions = {}): Promise<SeedResult[]> {
  if (isBackup(json)) return [await seedUser(undefined, json, json.data, opts)];
  // No embedModel in the header → every message is embedded on import.
  const header: Partial<BackupHeader> = { format: BACKUP_FORMAT, version: 1 };
  if (isSeed(json)) {
    return [await seedUser(json.user, header, json.conversations.map(toBackupConversation), opts)];
  }
  if (isUsers(json)) {
    const results: SeedResult[] = [];
    for (const [i, u] of json.users.entries()) {
      if (typeof u?.email !== "string") throw new Error(`users[${i}]: email is required`);
      const { id, created } = await resolveSeedUser(u.email, { password: opts.password ?? u.password, name: u.name });
      results.push({ ...EMPTY, userId: id, email: u.email.trim().toLowerCase(), createdUser: created });
    }
    return results;
  }
  throw new Error('Not a seed file: expected { "conversations": [...] }, { "users": [...] } or a next-mem0 backup');
}

/** Seed from a JSON file on disk. */
export async function seedFromFile(file: string, opts: SeedOptions = {}): Promise<SeedResult[]> {
  let json: unknown;
  try {
    json = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return seed(json, opts);
}
