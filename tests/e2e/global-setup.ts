import fs from "node:fs/promises";
import path from "node:path";
import { TEST_DATA_DIR, TEST_DATA_ROOT } from "../../playwright.config";

/** Remove data left behind by previous runs; the current run's directory is in use by the dev server. */
export default async function globalSetup() {
  await fs.mkdir(TEST_DATA_ROOT, { recursive: true });
  for (const entry of await fs.readdir(TEST_DATA_ROOT)) {
    const full = path.join(TEST_DATA_ROOT, entry);
    if (full !== TEST_DATA_DIR) await fs.rm(full, { recursive: true, force: true });
  }
}
