#!/usr/bin/env node
/**
 * next-mem0-sync — import the chats you had with the Codex CLI into your next-mem0.
 *
 * Runs on YOUR machine (that is where ~/.codex/sessions lives), talks to the next-mem0 server
 * over HTTP, needs nothing but Node 20+. Download it from the Import page of your next-mem0, then:
 *
 *   node next-mem0-sync.mjs login https://your-next-mem0.example    # once; stores the session
 *   node next-mem0-sync.mjs codex                                    # list threads, pick, import
 *   node next-mem0-sync.mjs codex --latest | --all | <thread-id>…    # without the picker
 *   node next-mem0-sync.mjs status | logout
 *
 * Options for `codex`: --replace (refresh threads that were imported before), --limit N (only
 * the N newest), --list (print and exit), --include-exec (also show headless `codex exec`
 * runs — scripts, SDKs, next-mem0's own chat panel — hidden by default). Env: CODEX_HOME
 * (default ~/.codex), NEXT_MEM0_HOME (where the session is stored, default ~/.next-mem0).
 *
 * Codex's own prompt scaffolding (environment context, plugin lists, AGENTS.md, image tags) is
 * stripped server-side, reasoning and tool calls are never uploaded, and the Codex thread id is
 * kept — continuing an imported chat inside next-mem0 resumes that same thread.
 */
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { parseArgs } from "node:util";

const VERSION = "1";
const HOME = process.env.NEXT_MEM0_HOME ?? path.join(os.homedir(), ".next-mem0");
const CONFIG = path.join(HOME, "sync.json");
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");

// ---------- tiny helpers ----------

const obj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : "");
const short = (id) => id.slice(0, 8);
const when = (iso) => iso.slice(0, 16).replace("T", " ");

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function* jsonLines(file) {
  const rl = readline.createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const v = JSON.parse(t);
      if (obj(v)) yield v;
    } catch {
      // a partially written last line while Codex is still running
    }
  }
}

/**
 * Prompts. One readline for the whole run, with lines queued as they arrive — readline emits them
 * as soon as a chunk lands, so with piped input a `question()` per prompt would lose the answers
 * that came in early.
 */
let rl = null;
const lines = [];
const waiters = [];
let stdinClosed = false;
function prompt() {
  if (rl) return rl;
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  rl.on("line", (line) => (waiters.length ? waiters.shift()(line) : lines.push(line)));
  rl.on("close", () => {
    stdinClosed = true;
    while (waiters.length) waiters.shift()("");
  });
  return rl;
}

async function ask(question, { hidden = false } = {}) {
  const r = prompt();
  const mute = hidden && process.stdin.isTTY;
  process.stdout.write(question);
  if (mute) r._writeToOutput = () => {}; // swallow the echoed keystrokes
  const answer = await new Promise((resolve) => {
    if (lines.length) resolve(lines.shift());
    else if (stdinClosed) resolve("");
    else waiters.push(resolve);
  });
  if (mute) {
    delete r._writeToOutput;
    process.stdout.write("\n");
  }
  return answer.trim();
}

// ---------- server session ----------

async function readConfig() {
  try {
    const c = JSON.parse(await fs.readFile(CONFIG, "utf8"));
    return obj(c) ? c : {};
  } catch {
    return {};
  }
}

async function writeConfig(c) {
  await fs.mkdir(HOME, { recursive: true });
  await fs.writeFile(CONFIG, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 });
}

function normalizeServer(input) {
  let s = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(s)) s = `http://${s}`;
  return new URL(s).origin;
}

async function api(cfg, route, init = {}) {
  if (!cfg.server || !cfg.cookie) fail("Not signed in. Run: node next-mem0-sync.mjs login <server-url>");
  const res = await fetch(`${cfg.server}${route}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: cfg.cookie,
      origin: cfg.server,
      "user-agent": `next-mem0-sync/${VERSION} node/${process.versions.node}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) fail(`${cfg.server}: session expired or invalid. Run: node next-mem0-sync.mjs login`);
  if (!res.ok) throw new Error(body.error ?? body.message ?? `${route} → HTTP ${res.status}`);
  return body;
}

async function login(serverArg) {
  const cfg = await readConfig();
  const server = normalizeServer(serverArg || (await ask(`next-mem0 URL [${cfg.server ?? "http://localhost:3000"}]: `)) || cfg.server || "http://localhost:3000");
  const email = await ask("Email: ");
  const password = await ask("Password: ", { hidden: true });
  if (!email || !password) fail("Email and password are required");

  const res = await fetch(`${server}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: server },
    body: JSON.stringify({ email, password }),
  }).catch((err) => fail(`Cannot reach ${server}: ${err.message}`));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    fail(`Sign-in failed (${res.status}): ${body.message ?? body.error ?? "check the email and password"}`);
  }
  // Keep the session cookie(s) exactly as the server set them (name differs between http and https).
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("session_token"))
    .join("; ");
  if (!cookie) fail("Signed in, but the server did not return a session cookie");

  const next = { server, cookie, email, savedAt: new Date().toISOString() };
  const who = await api(next, "/api/import/codex");
  await writeConfig(next);
  console.log(`Signed in to ${server} as ${who.user}. Session saved in ${CONFIG}`);
}

async function status() {
  const cfg = await readConfig();
  if (!cfg.server) return console.log("Not signed in. Run: node next-mem0-sync.mjs login <server-url>");
  const who = await api(cfg, "/api/import/codex");
  const n = Object.keys(who.imported).length;
  console.log(`${cfg.server} — signed in as ${who.user}; ${n} Codex thread(s) imported so far`);
}

async function logout() {
  await fs.rm(CONFIG, { force: true });
  console.log("Signed out (local session removed).");
}

// ---------- Codex sessions on this machine ----------

/** Names Codex assigned to threads (only threads that got one appear in the index). */
async function readSessionIndex() {
  const names = new Map();
  try {
    for await (const row of jsonLines(path.join(CODEX_HOME, "session_index.jsonl"))) {
      const id = str(row.id);
      const name = str(row.thread_name).trim();
      if (id && name) names.set(id, name);
    }
  } catch {
    // no index yet
  }
  return names;
}

async function* rolloutFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* rolloutFiles(p);
    else if (e.isFile() && e.name.startsWith("rollout-") && e.name.endsWith(".jsonl")) yield p;
  }
}

/** Light copy of lib/codex-rollout.ts cleanUserText(), only to show a readable title in the list. */
function cleanUserText(raw) {
  let text = raw
    .replace(/<(environment_context|recommended_plugins|user_instructions|turn_aborted)>[\s\S]*?<\/\1>/g, "")
    .replace(/<(codex_delegation|realtime_delegation)>[\s\S]*?<\/\1>/g, (block) => (/<input>([\s\S]*?)<\/input>/.exec(block) ?? ["", ""])[1])
    .replace(/<image\b[^>]*>(?:\s*<\/image>)?/g, "")
    .replace(/^\s*# AGENTS\.md instructions for [^\n]*\n+<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/, "");
  const request = /^\s*# Files mentioned by the user:[\s\S]*?## My request for Codex:\n?/.exec(text);
  if (request) text = text.slice(request[0].length);
  return text.trim();
}

const isMessageRow = (row) =>
  row.type === "response_item" && obj(row.payload) && row.payload.type === "message" && (row.payload.role === "user" || row.payload.role === "assistant");

function userText(row) {
  const content = Array.isArray(row.payload.content) ? row.payload.content : [];
  return content.filter((p) => obj(p) && p.type === "input_text").map((p) => str(p.text)).join("\n");
}

/** Metadata of one rollout without reading the whole file. */
async function readMeta(file, names) {
  let meta = null;
  let firstUser = "";
  for await (const row of jsonLines(file)) {
    if (row.type === "session_meta" && obj(row.payload)) meta = row.payload;
    else if (isMessageRow(row) && row.payload.role === "user") {
      firstUser = cleanUserText(userText(row));
      if (firstUser) break;
    }
  }
  const id = meta ? str(meta.id) || str(meta.session_id) : "";
  if (!id) return null;
  const stat = await fs.stat(file);
  return {
    id,
    file,
    name: names.get(id),
    title: names.get(id) ?? firstUser.split("\n")[0].slice(0, 80),
    cwd: str(meta.cwd),
    kind: KIND[str(meta.source)] ?? str(meta.source), // where the chat happened
    headless: str(meta.source) === "exec",
    startedAt: str(meta.timestamp) || stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
  };
}

/** session_meta.source → label. "exec" is `codex exec`: scripts, SDKs, next-mem0's own chat panel. */
const KIND = { cli: "tui", vscode: "app", exec: "exec" };

async function listSessions({ includeExec }) {
  const names = await readSessionIndex();
  const out = [];
  for await (const file of rolloutFiles(path.join(CODEX_HOME, "sessions"))) {
    const s = await readMeta(file, names);
    if (s && (includeExec || !s.headless)) out.push(s);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Only what the server needs: session_meta + user/assistant messages. Reasoning and tool calls stay here. */
async function uploadRows(file) {
  const rows = [];
  for await (const row of jsonLines(file)) {
    if (row.type === "session_meta" || isMessageRow(row)) rows.push(row);
  }
  return rows;
}

// ---------- `codex` command ----------

function describe(s, i, imported) {
  const n = `${String(i + 1).padStart(3)}. `;
  const mark = imported[s.id] ? "✓" : " ";
  return `${n}${mark} ${short(s.id)}  ${when(s.updatedAt)}  ${s.kind.padEnd(4)}  ${s.title || "(untitled)"}\n${" ".repeat(n.length + 2)}${s.cwd}`;
}

async function pick(sessions, imported, opts) {
  const shown = sessions.slice(0, opts.limit);
  const count = shown.length < sessions.length ? `${shown.length} of ${sessions.length}` : `${sessions.length}`;
  console.log(`Codex sessions in ${CODEX_HOME} (newest first, ${count}; ✓ = already imported)`);
  console.log(opts.includeExec ? "" : "Headless `codex exec` runs are hidden — add --include-exec to see them.\n");
  shown.forEach((s, i) => console.log(describe(s, i, imported)));
  if (opts.list) return [];
  const answer = await ask("\nImport which? (numbers, e.g. 1 3-5, or 'all'; empty to quit) ");
  if (!answer) return [];
  if (answer === "all") return shown;
  const chosen = new Set();
  for (const part of answer.split(/[\s,]+/)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) fail(`Not a number: ${part}`);
    for (let n = Number(m[1]); n <= Number(m[2] ?? m[1]); n++) chosen.add(n - 1);
  }
  return shown.filter((_, i) => chosen.has(i));
}

function byId(sessions, ids) {
  return ids.map((id) => {
    const hits = sessions.filter((s) => s.id === id || s.id.startsWith(id));
    if (hits.length === 1) return hits[0];
    fail(hits.length ? `"${id}" matches ${hits.length} sessions; be more specific` : `No Codex session "${id}"`);
  });
}

async function codex(ids, opts) {
  const cfg = await readConfig();
  const { imported } = await api(cfg, "/api/import/codex");
  const sessions = await listSessions(opts);
  if (!sessions.length) fail(`No Codex sessions found under ${CODEX_HOME}${opts.includeExec ? "" : " (try --include-exec)"}`);

  let selected;
  if (ids.length) selected = byId(sessions, ids);
  else if (opts.latest) selected = [sessions[0]];
  else if (opts.all) selected = sessions;
  else selected = await pick(sessions, imported, opts);
  if (!selected.length) return;

  let done = 0;
  let skipped = 0;
  for (const s of selected) {
    if (imported[s.id] && !opts.replace) {
      console.log(`skip     ${short(s.id)}  already imported → ${cfg.server}/c/${imported[s.id].id}  (use --replace)`);
      skipped++;
      continue;
    }
    const rows = await uploadRows(s.file);
    const r = await api(cfg, "/api/import/codex", {
      method: "POST",
      body: JSON.stringify({
        session: { id: s.id, name: s.name, cwd: s.cwd, startedAt: s.startedAt, updatedAt: s.updatedAt },
        rows,
        replace: opts.replace,
      }),
    });
    if (r.skipped) {
      console.log(`skip     ${short(s.id)}  already imported → ${r.url}`);
      skipped++;
    } else {
      console.log(`${r.replaced ? "replaced" : "imported"} ${short(s.id)}  ${r.messages} message(s) → ${r.url}  ${r.title}`);
      done++;
    }
  }
  console.log(`\nDone: ${done} imported, ${skipped} skipped, on ${cfg.server}`);
}

// ---------- main ----------

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: "boolean", default: false },
    "include-exec": { type: "boolean", default: false },
    latest: { type: "boolean", default: false },
    list: { type: "boolean", default: false },
    replace: { type: "boolean", default: false },
    limit: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});
const [command, ...rest] = positionals;

if (values.help || !command) {
  console.log(`next-mem0-sync — import Codex CLI chats into next-mem0

  node next-mem0-sync.mjs login [server-url]
  node next-mem0-sync.mjs codex [--latest | --all | --list | <thread-id>…] [--replace] [--limit N] [--include-exec]
  node next-mem0-sync.mjs status
  node next-mem0-sync.mjs logout`);
  process.exit(values.help ? 0 : 1);
}

try {
  if (command === "login") await login(rest[0]);
  else if (command === "codex") await codex(rest, { ...values, includeExec: values["include-exec"], limit: values.limit ? Math.max(1, Number(values.limit) || Infinity) : Infinity });
  else if (command === "status") await status();
  else if (command === "logout") await logout();
  else fail(`Unknown command "${command}". Try --help`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  rl?.close();
}
