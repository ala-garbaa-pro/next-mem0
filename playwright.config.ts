import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a real `next dev` server on a dedicated Postgres database (wiped by the
 * global setup, which also signs up the test user). Embeddings use the local Ollama server; the CLI
 * chat tests use the real `claude` / `codex` binaries.
 */
const PORT = 3311;
export const BASE_URL = `http://localhost:${PORT}`;
// Same server as `docker compose up -d`, separate database (created on first connection).
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/next_mem0_test";
export const TEST_USER = { name: "Test User", email: "e2e@next-mem0.test", password: "correct horse battery" };

// Fresh directory per run, pinned through the environment so worker processes (which re-evaluate
// this file) resolve the same one. (Playwright starts webServer before globalSetup, so the setup
// only sweeps previous runs instead of wiping the directory the server is already using.)
process.env.MEM0_E2E_RUN ??= String(process.pid);
export const TEST_DATA_ROOT = path.join(process.cwd(), ".test-data");
export const TEST_DATA_DIR = path.join(TEST_DATA_ROOT, `run-${process.env.MEM0_E2E_RUN}`);
export const STORAGE_STATE = path.join(TEST_DATA_DIR, "auth.json");

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "edge",
      // Use the system Edge so no browser download is required.
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
  ],
  webServer: {
    command: `bun run dev -p ${PORT}`,
    url: `${BASE_URL}/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-0000000000",
      MEM0_CLI_CWD: path.join(TEST_DATA_DIR, "cli-workspace"),
    },
  },
});
