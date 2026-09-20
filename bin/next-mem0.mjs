#!/usr/bin/env node
// Starts the pre-built Next.js server that ships in this package.
// Settings live in ~/.next-mem0 by default so they survive `npx` cache cleanups.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = createRequire(path.join(pkgDir, "package.json")).resolve("next/dist/bin/next");

const homeDir = process.env.MEM0_HOME ?? path.join(os.homedir(), ".next-mem0");
const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/next_mem0";

/** Better Auth needs a stable secret in production; generate one once and keep it next to the data. */
function authSecret() {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const file = path.join(homeDir, "auth-secret");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    /* first run */
  }
  const secret = randomBytes(32).toString("hex");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(file, secret + "\n", { mode: 0o600 });
  return secret;
}

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`next-mem0 — local AI conversation memory

Usage: next-mem0 [-p <port>] [-H <hostname>]

Requires:
  - PostgreSQL with the pgvector extension   (docker compose up -d  in the repo, or any server)
  - Ollama running with the embedding model  (ollama pull nomic-embed-text)

Environment:
  DATABASE_URL         ${DEFAULT_DATABASE_URL}
  BETTER_AUTH_SECRET   generated once into ${path.join(homeDir, "auth-secret")}
  MEM0_HOME            ${homeDir}
  MEM0_CLI_CWD         ${path.join(homeDir, "cli-workspace")}
  MEM0_DISABLE_SIGNUP  set to 1 after creating your account to block new sign-ups
  OLLAMA_URL, OLLAMA_EMBED_MODEL, EMBED_DIM, MEM0_MIN_SIMILARITY`);
  process.exit(0);
}

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  BETTER_AUTH_SECRET: authSecret(),
  MEM0_CLI_CWD: process.env.MEM0_CLI_CWD ?? path.join(homeDir, "cli-workspace"),
};

const child = spawn(process.execPath, [nextBin, "start", ...args], { cwd: pkgDir, env, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
