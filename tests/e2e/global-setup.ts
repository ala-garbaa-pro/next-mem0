import fs from "node:fs/promises";
import path from "node:path";
import { request } from "@playwright/test";
import { BASE_URL, STORAGE_STATE, TEST_DATABASE_URL, TEST_DATA_DIR, TEST_DATA_ROOT, TEST_USER } from "../../playwright.config";

/**
 * 1. Remove data left behind by previous runs (the current run's directory is in use by the dev server).
 * 2. Empty the test database — the dev server is already up but idle, and it migrates on first use.
 * 3. Sign the test user up through the real auth API and save the cookies for every test.
 */
export default async function globalSetup() {
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  for (const entry of await fs.readdir(TEST_DATA_ROOT)) {
    const full = path.join(TEST_DATA_ROOT, entry);
    if (full !== TEST_DATA_DIR) await fs.rm(full, { recursive: true, force: true });
  }

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { db, ready, closeDb } = await import("../../lib/drizzle");
  const { sql } = await import("drizzle-orm");
  await ready();
  // Everything hangs off user (cascade); verification is standalone.
  await db.execute(sql`TRUNCATE "user", "verification" CASCADE`);
  await closeDb();

  const api = await request.newContext({ baseURL: BASE_URL });
  const res = await api.post("/api/auth/sign-up/email", { data: TEST_USER });
  if (!res.ok()) throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
  await api.storageState({ path: STORAGE_STATE });
  await api.dispose();
}
