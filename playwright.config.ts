import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a real `next dev` server with an isolated LanceDB directory.
 * Embeddings use the local Ollama server; the CLI chat tests use the real `claude` / `codex` binaries.
 */
const PORT = 3311;
// Fresh directory per run. (Playwright starts webServer before globalSetup, so the setup
// only sweeps previous runs instead of wiping the directory the server is already using.)
export const TEST_DATA_ROOT = path.join(process.cwd(), ".test-data");
export const TEST_DATA_DIR = path.join(TEST_DATA_ROOT, `run-${process.pid}`);

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
    baseURL: `http://localhost:${PORT}`,
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
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      MEM0_DB_PATH: path.join(TEST_DATA_DIR, "lancedb"),
      MEM0_CLI_CWD: path.join(TEST_DATA_DIR, "cli-workspace"),
    },
  },
});
