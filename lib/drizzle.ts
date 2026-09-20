/**
 * Postgres connection (postgres.js) wrapped in Drizzle.
 *
 * `db` is created synchronously (postgres.js only connects on the first query) so Better Auth can
 * hold it. `ready()` creates the database if needed and applies the migrations in ./drizzle; every
 * entry point awaits it before touching the tables.
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/next_mem0";
const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** Host/db shown in the UI — the URL without credentials. */
export function describeDatabase(url = DATABASE_URL): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "postgres";
  }
}

const connect = (url: string) => postgres(url, { max: 8, onnotice: () => {} });
const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;

// Survive HMR in dev: keep one client on globalThis.
const g = globalThis as unknown as { __mem0Sql?: Sql; __mem0Ready?: Promise<void> };

const sql = (g.__mem0Sql ??= connect(DATABASE_URL));
export const db = drizzle(sql, { schema });
export type Db = typeof db;

/** Create the database named in DATABASE_URL if the server is up but the database is missing. */
async function ensureDatabase(url: string): Promise<void> {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName) return;
  try {
    await sql`select 1`;
    return;
  } catch (err) {
    // 3D000 = invalid_catalog_name
    if ((err as { code?: string }).code !== "3D000") throw describeConnectionError(err, url);
  }
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const admin = connect(maintenance.toString());
  try {
    await admin.unsafe(`CREATE DATABASE ${quoteIdent(dbName)}`);
  } finally {
    await admin.end();
  }
}

function describeConnectionError(err: unknown, url: string): Error {
  const code = (err as { code?: string }).code;
  if (code === "ECONNREFUSED") {
    return new Error(
      `Cannot reach Postgres at ${describeDatabase(url)}. Start it (docker compose up -d) or set DATABASE_URL.`,
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

async function prepare(): Promise<void> {
  await ensureDatabase(DATABASE_URL);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      /extension "vector"/i.test(msg)
        ? `pgvector is not installed in this Postgres (${msg}). Use the pgvector/pgvector image from docker-compose.yml or install the extension.`
        : msg,
    );
  }
}

/** Resolves once the database exists and is migrated. Cheap after the first call. */
export function ready(): Promise<void> {
  g.__mem0Ready ??= prepare().catch((err) => {
    g.__mem0Ready = undefined;
    throw err;
  });
  return g.__mem0Ready;
}

export async function closeDb(): Promise<void> {
  g.__mem0Ready = undefined;
  g.__mem0Sql = undefined;
  await sql.end();
}
