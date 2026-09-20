#!/usr/bin/env node
// Starts the pre-built Next.js server that ships in this package.
// Data lives in ~/.next-mem0 by default so it survives `npx` cache cleanups.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = createRequire(path.join(pkgDir, "package.json")).resolve("next/dist/bin/next");

const dataDir = process.env.MEM0_HOME ?? path.join(os.homedir(), ".next-mem0");
const env = {
  ...process.env,
  MEM0_DB_PATH: process.env.MEM0_DB_PATH ?? path.join(dataDir, "lancedb"),
  MEM0_CLI_CWD: process.env.MEM0_CLI_CWD ?? path.join(dataDir, "cli-workspace"),
};

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`next-mem0 — local AI conversation memory

Usage: next-mem0 [-p <port>] [-H <hostname>]

Requires Ollama running with the nomic-embed-text model:
  ollama pull nomic-embed-text

Data directory: ${dataDir}  (override with MEM0_HOME)
Other env vars: MEM0_DB_PATH, MEM0_CLI_CWD, OLLAMA_URL, OLLAMA_EMBED_MODEL, EMBED_DIM, MEM0_MIN_SIMILARITY`);
  process.exit(0);
}

const child = spawn(process.execPath, [nextBin, "start", ...args], { cwd: pkgDir, env, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
