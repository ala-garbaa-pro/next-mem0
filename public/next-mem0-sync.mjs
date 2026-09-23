#!/usr/bin/env node
/**
 * next-mem0-sync — import the chats you had with the Codex and Claude Code CLIs into your next-mem0.
 *
 * Runs on YOUR machine (that is where ~/.codex/sessions and ~/.claude/projects live), talks to the
 * next-mem0 server over HTTP, needs nothing but Node 20+. Download it from the Import page, then:
 *
 *   node next-mem0-sync.mjs login https://your-next-mem0.example    # once; stores the session
 *   node next-mem0-sync.mjs codex                                    # list threads, pick, import
 *   node next-mem0-sync.mjs claude                                   # same, for Claude Code
 *   node next-mem0-sync.mjs codex --latest | --all | <session-id>…   # without the picker
 *   node next-mem0-sync.mjs status | logout
 *
 * Options for `codex` and `claude`: --replace (refresh sessions that were imported before),
 * --limit N (only the N newest), --list (print and exit), --include-exec (also show headless runs
 * — scripts, SDKs, next-mem0's own chat panel — hidden by default). `claude` also takes
 * --profile <name>, since one machine often holds several Claude Code homes: ~/.claude and every
 * ~/.config/*claude* directory are read together unless CLAUDE_CONFIG_DIR names one. Env:
 * CODEX_HOME (default ~/.codex), CLAUDE_CONFIG_DIR, NEXT_MEM0_HOME (where the session is stored,
 * default ~/.next-mem0).
 *
 * Each CLI's own prompt scaffolding is stripped server-side — environment context, plugin lists and
 * AGENTS.md for Codex; system reminders, CLAUDE.md and slash-command wrappers for Claude Code — and
 * reasoning and tool calls are never uploaded. The session id is kept, so continuing an imported
 * chat inside next-mem0 resumes that same session in that same CLI.
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
const CONFIG_ROOT = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");

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
  let who;
  const counts = [];
  for (const tool of Object.values(TOOLS)) {
    const res = await api(cfg, tool.route);
    who ??= res;
    counts.push(`${Object.keys(res.imported).length} ${tool.label} ${tool.noun}(s)`);
  }
  console.log(`${cfg.server} — signed in as ${who.user}; ${counts.join(", ")} imported so far`);
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

// ---------- Claude Code sessions on this machine ----------

/** Light copy of lib/claude-session.ts cleanUserText(), only to show a readable title in the list. */
function cleanClaudeUserText(raw) {
  return raw
    .replace(
      /<(system-reminder|command-message|local-command-stdout|local-command-stderr|ide_selection|ide_opened_file)>[\s\S]*?<\/\1>/g,
      "",
    )
    .replace(/<command-name>([\s\S]*?)<\/command-name>(?:\s*<command-args>([\s\S]*?)<\/command-args>)?/g, (_a, n, g) =>
      `${n.trim()} ${(g ?? "").trim()}`.trim(),
    )
    .replace(/<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content>/g, "")
    .trim();
}

/** Text of a Claude Code message: `content` is a bare string or an array whose `text` blocks we keep. */
function claudeText(message) {
  if (!obj(message)) return "";
  const c = message.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.filter((p) => obj(p) && p.type === "text").map((p) => str(p.text)).join("\n");
}

/** Rows that carry a message the user actually saw in their own thread. */
const isClaudeMessageRow = (row) =>
  (row.type === "user" || row.type === "assistant") &&
  row.isSidechain !== true &&
  row.isMeta !== true &&
  row.isCompactSummary !== true &&
  obj(row.message);

/**
 * Every Claude Code home on this machine. One person often has several: `claude` keeps its data in
 * ~/.claude by default, but a profile started with CLAUDE_CONFIG_DIR gets its own directory, and
 * those conventionally sit side by side under ~/.config (claude-pro-ala, claude-pro-mouna, …).
 * Looking only at ~/.claude would miss almost everything on such a machine.
 *
 * CLAUDE_CONFIG_DIR still wins when it is set — that is the profile the user is asking about — and
 * it may name several homes, separated the way the platform separates PATH entries.
 */
async function claudeHomes() {
  const homes = [];
  const add = async (dir, name) => {
    try {
      // A home worth reading is one that has sessions in it.
      await fs.stat(path.join(dir, "projects"));
      if (!homes.some((h) => h.dir === dir)) homes.push({ name, dir });
    } catch {
      // no projects/ here — an empty or unrelated directory
    }
  };

  const explicit = process.env.CLAUDE_CONFIG_DIR;
  if (explicit) {
    for (const dir of explicit.split(path.delimiter).filter(Boolean)) await add(path.resolve(dir), path.basename(dir));
    return homes;
  }

  await add(path.join(os.homedir(), ".claude"), "default");
  let entries = [];
  try {
    entries = await fs.readdir(CONFIG_ROOT, { withFileTypes: true });
  } catch {
    // no ~/.config on this machine
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory() && /claude/i.test(e.name)) await add(path.join(CONFIG_ROOT, e.name), e.name);
  }
  return homes;
}

async function* claudeSessionFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* claudeSessionFiles(p);
    else if (e.isFile() && e.name.endsWith(".jsonl")) yield p;
  }
}

/**
 * Metadata of one session. Unlike a Codex rollout there is no header row, so the id, cwd and title
 * are gathered as the file is walked: `ai-title` rows hold the title Claude Code generated (the last
 * one wins — it is rewritten as the chat grows) and the first typed user turn is the fallback.
 */
async function readClaudeMeta(file) {
  let id = "";
  let cwd = "";
  let name = "";
  let firstUser = "";
  let entrypoint = "";
  let sawMessage = false;
  for await (const row of jsonLines(file)) {
    id ||= str(row.sessionId);
    if (row.type === "ai-title") {
      name = str(row.aiTitle).trim() || name;
      continue;
    }
    if (row.type === "summary") {
      name ||= str(row.summary).trim();
      continue;
    }
    if (!isClaudeMessageRow(row)) continue;
    sawMessage = true;
    cwd ||= str(row.cwd);
    entrypoint ||= str(row.entrypoint);
    // Skip bare local commands ("/login", "/model") the way the server-side parser does, so the
    // title in this list is the one the imported conversation will actually get.
    if (row.type === "user" && !firstUser) {
      const text = cleanClaudeUserText(claudeText(row.message));
      if (text && !/^\/[\w:.-]+([ \t][^\n]*)?$/.test(text)) firstUser = text;
    }
  }
  if (!id || !sawMessage) return null;
  const stat = await fs.stat(file);
  return {
    id,
    file,
    name: name || undefined,
    title: name || firstUser.split("\n")[0].slice(0, 80),
    cwd,
    // `claude -p` from a script, an SDK or next-mem0's own chat panel reports a non-"cli" entrypoint.
    kind: entrypoint === "cli" || !entrypoint ? "cli" : "exec",
    headless: Boolean(entrypoint) && entrypoint !== "cli",
    startedAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
  };
}

async function listClaudeSessions({ includeExec, profile }) {
  let homes = await claudeHomes();
  if (profile) {
    const wanted = homes.filter((h) => h.name === profile || h.name.includes(profile));
    if (!wanted.length) fail(`No Claude Code profile matches "${profile}". Found: ${homes.map((h) => h.name).join(", ") || "none"}`);
    homes = wanted;
  }
  const out = [];
  for (const home of homes) {
    for await (const file of claudeSessionFiles(path.join(home.dir, "projects"))) {
      const s = await readClaudeMeta(file);
      // Which profile a session came from matters: it is where `claude --resume` will find it.
      if (s && (includeExec || !s.headless)) out.push({ ...s, profile: homes.length > 1 ? home.name : "" });
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Only what the server needs: the message rows plus the title rows. Tool calls stay here. */
async function claudeUploadRows(file) {
  const rows = [];
  for await (const row of jsonLines(file)) {
    if (isClaudeMessageRow(row) || row.type === "ai-title" || row.type === "summary") rows.push(row);
  }
  return rows;
}

// ---------- `codex` / `claude` commands ----------

/** The two CLIs differ only in where their logs live, how they are read, and which route takes them. */
const TOOLS = {
  codex: {
    label: "Codex",
    home: async () => CODEX_HOME,
    route: "/api/import/codex",
    list: listSessions,
    rows: uploadRows,
    noun: "thread",
    hiddenHint: "Headless `codex exec` runs are hidden — add --include-exec to see them.",
  },
  claude: {
    label: "Claude Code",
    // Several profiles are normal here, so the header names them all rather than one path.
    home: async () => {
      const homes = await claudeHomes();
      if (!homes.length) return path.join(os.homedir(), ".claude");
      return homes.length === 1 ? homes[0].dir : homes.map((h) => `${h.name} (${h.dir})`).join(", ");
    },
    route: "/api/import/claude-code",
    list: listClaudeSessions,
    rows: claudeUploadRows,
    noun: "session",
    hiddenHint: "Headless `claude -p` runs are hidden — add --include-exec to see them.",
  },
};

function describe(s, i, imported, profileWidth) {
  const n = `${String(i + 1).padStart(3)}. `;
  const mark = imported[s.id] ? "✓" : " ";
  const profile = profileWidth ? `  ${(s.profile ?? "").padEnd(profileWidth)}` : "";
  return `${n}${mark} ${short(s.id)}  ${when(s.updatedAt)}  ${s.kind.padEnd(4)}${profile}  ${s.title || "(untitled)"}\n${" ".repeat(n.length + 2)}${s.cwd}`;
}

async function pick(tool, sessions, imported, opts) {
  const shown = sessions.slice(0, opts.limit);
  const count = shown.length < sessions.length ? `${shown.length} of ${sessions.length}` : `${sessions.length}`;
  const profileWidth = Math.max(0, ...shown.map((s) => (s.profile ?? "").length));
  console.log(`${tool.label} ${tool.noun}s in ${await tool.home()} (newest first, ${count}; ✓ = already imported)`);
  console.log(opts.includeExec ? "" : `${tool.hiddenHint}\n`);
  shown.forEach((s, i) => console.log(describe(s, i, imported, profileWidth)));
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

function byId(tool, sessions, ids) {
  return ids.map((id) => {
    const hits = sessions.filter((s) => s.id === id || s.id.startsWith(id));
    if (hits.length === 1) return hits[0];
    fail(
      hits.length
        ? `"${id}" matches ${hits.length} ${tool.noun}s; be more specific`
        : `No ${tool.label} ${tool.noun} "${id}"`,
    );
  });
}

async function runImport(tool, ids, opts) {
  const cfg = await readConfig();
  const { imported } = await api(cfg, tool.route);
  const sessions = await tool.list(opts);
  if (!sessions.length) {
    fail(`No ${tool.label} ${tool.noun}s found under ${await tool.home()}${opts.includeExec ? "" : " (try --include-exec)"}`);
  }

  let selected;
  if (ids.length) selected = byId(tool, sessions, ids);
  else if (opts.latest) selected = [sessions[0]];
  else if (opts.all) selected = sessions;
  else selected = await pick(tool, sessions, imported, opts);
  if (!selected.length) return;

  let done = 0;
  let skipped = 0;
  for (const s of selected) {
    if (imported[s.id] && !opts.replace) {
      console.log(`skip     ${short(s.id)}  already imported → ${cfg.server}/c/${imported[s.id].id}  (use --replace)`);
      skipped++;
      continue;
    }
    const rows = await tool.rows(s.file);
    let r;
    try {
      r = await api(cfg, tool.route, {
        method: "POST",
        body: JSON.stringify({
          session: { id: s.id, name: s.name, cwd: s.cwd, startedAt: s.startedAt, updatedAt: s.updatedAt },
          rows,
          replace: opts.replace,
        }),
      });
    } catch (err) {
      // A server-side failure (typically its Ollama is down) would hit every remaining thread too.
      fail(`failed   ${short(s.id)}  ${err.message}\n\nStopped after ${done} imported, ${skipped} skipped. Fix the server and run the same command again.`);
    }
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
    profile: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});
const [command, ...rest] = positionals;

if (values.help || !command) {
  console.log(`next-mem0-sync — import Codex CLI and Claude Code chats into next-mem0

  node next-mem0-sync.mjs login [server-url]
  node next-mem0-sync.mjs codex  [--latest | --all | --list | <session-id>…] [--replace] [--limit N] [--include-exec]
  node next-mem0-sync.mjs claude [--latest | --all | --list | <session-id>…] [--replace] [--limit N] [--include-exec]
                                 [--profile <name>]   only one Claude Code profile
  node next-mem0-sync.mjs status
  node next-mem0-sync.mjs logout

Claude Code profiles are found in ~/.claude and in every ~/.config/*claude* directory;
set CLAUDE_CONFIG_DIR to read one specific home instead.`);
  process.exit(values.help ? 0 : 1);
}

try {
  const opts = {
    ...values,
    includeExec: values["include-exec"],
    limit: values.limit ? Math.max(1, Number(values.limit) || Infinity) : Infinity,
  };
  if (command === "login") await login(rest[0]);
  else if (TOOLS[command]) await runImport(TOOLS[command], rest, opts);
  else if (command === "status") await status();
  else if (command === "logout") await logout();
  else fail(`Unknown command "${command}". Try --help`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  rl?.close();
}
