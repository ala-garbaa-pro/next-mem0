# next-mem0

**AI conversation memory in your own Postgres.** Keep every conversation you have with ChatGPT, Claude,
Codex or any other assistant, and search all of it by meaning.

[![npm](https://img.shields.io/npm/v/next-mem0)](https://www.npmjs.com/package/next-mem0)
[![license](https://img.shields.io/npm/l/next-mem0)](LICENSE)

- **Your database** — conversations and their vectors live in PostgreSQL with the
  [pgvector](https://github.com/pgvector/pgvector) extension (schema managed by
  [Drizzle](https://orm.drizzle.team)). Embeddings come from [Ollama](https://ollama.com) on localhost.
  No cloud, no API keys.
- **Accounts** — [Better Auth](https://www.better-auth.com) email + password sign-in; every user sees
  only their own conversations.
- **Semantic search** — ask "that time I debugged the Postgres connection pool" and find the
  conversation even if those words never appeared in it.
- **Backup** — export everything (vectors included) to one JSON file and import it anywhere else.
- **Many ways in**
  - one-click **browser extension** that saves the ChatGPT conversation open in the current tab
  - import a **ChatGPT** or **Claude.ai** data export (`conversations.json`)
  - paste a transcript (`User:` / `Assistant:` lines are split into messages) or add messages by hand
  - **chat with the `claude` or `codex` CLI** from inside the app; every turn is stored and the CLI
    session is resumed on the next message, so the assistant keeps its context too

## Quick start

You need three things: Node.js 20.9+ (or Bun), Ollama with the embedding model, and a Postgres with
pgvector. The repo's `docker-compose.yml` starts a suitable Postgres (image `pgvector/pgvector:pg18`)
on `localhost:5432` with user/password `postgres`/`postgres`; any other server with the extension
works via `DATABASE_URL`.

```bash
ollama pull nomic-embed-text
docker compose up -d      # from a checkout, or: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg18
npx next-mem0             # or: bunx next-mem0
```

Open <http://localhost:3000> and create your account — sign-up is off by default, so start with
`NEXT_MEM0_ALLOW_SIGNUP=1` the first time (or create accounts with `bun run db:seed:users`, see below),
then drop it again. The database `next_mem0` and its tables are created on first start; nothing
needs to be run by hand.

```
next-mem0 [-p <port>] [-H <hostname>]
```

Any other flag is passed straight to `next start`.

## Backup: export / import all data

**Backup** in the sidebar (`/backup`) downloads one JSON file with every conversation, message and
— by default — its embedding vector, so restoring it needs no Ollama and is instant. Import the file
on any next-mem0 (a new machine, a different Postgres, a fresh account) in **merge** mode (keeps what
is there, overwrites conversations with the same id) or **replace** mode (empties the store first).
Files exported without vectors, or with a different embedding model, are re-embedded on import.

The same thing over HTTP, with the browser's session cookie:

```bash
curl -b cookies.txt -o backup.json http://localhost:3000/api/backup            # ?vectors=0 to skip vectors
curl -b cookies.txt -X POST --data-binary @backup.json \
     -H 'content-type: application/json' 'http://localhost:3000/api/backup?mode=merge'   # or mode=replace
```

### Coming from next-mem0 0.1.x (LanceDB)

`scripts/lancedb-to-backup.ts` turns the old LanceDB directory into a backup file:

```bash
bun install --no-save @lancedb/lancedb apache-arrow
bun scripts/lancedb-to-backup.ts ~/.next-mem0/lancedb backup.json
```

then import `backup.json` from the Backup page. Vectors are carried over.

## Browser extension

The `extension/` folder is a plain Manifest V3 extension (no build step) that imports the conversation
open in the current tab into your next-mem0. It ships inside the npm package too:

1. Open `chrome://extensions` (Chrome / Edge / Brave), turn on **Developer mode**.
2. **Load unpacked** → pick `extension/` (from this repo, or from
   `node_modules/next-mem0/extension` after `npm i -g next-mem0`).
3. With next-mem0 running and **signed in in this browser**, open a chat on chatgpt.com and click the
   extension icon → **Import**. Re-clicking later replaces the saved copy with the current state of the chat.

The extension authenticates with the browser's session cookie. If the app is not on
`http://localhost:3000`, set the URL from the ⚙ in the popup.
Details in [`extension/README.md`](extension/README.md). Claude.ai and Gemini support are next.

## Chat through your CLIs

If the [`claude`](https://docs.anthropic.com/en/docs/claude-code) or
[`codex`](https://github.com/openai/codex) CLI is installed and logged in, the **New** page lets you
talk to it from the app. next-mem0 runs one headless turn per message (`claude -p` / `codex exec`),
streams the answer back, and stores the CLI's session id so the next turn resumes the same session.
The CLIs run in `NEXT_MEM0_CLI_CWD` (default `~/.next-mem0/cli-workspace`).

## Configuration

All optional, set as environment variables.

| Variable                   | Default                                                 | What it does                                                   |
| -------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`             | `postgres://postgres:postgres@localhost:5432/next_mem0` | Postgres with pgvector; the database is created if missing     |
| `BETTER_AUTH_SECRET`       | generated into `$NEXT_MEM0_HOME/auth-secret`            | signs session cookies (required when not using the launcher)   |
| `BETTER_AUTH_URL`          | derived from each request (loopback hosts only)         | pin the public origin, e.g. when served behind a proxy         |
| `NEXT_MEM0_ALLOWED_HOSTS`  | —                                                       | extra hosts to accept, comma-separated, e.g. `192.168.1.*:*`   |
| `NEXT_MEM0_ALLOW_SIGNUP`   | —                                                       | `1` lets people create accounts on `/sign-up` (off by default) |
| `NEXT_MEM0_HOME`           | `~/.next-mem0`                                          | where the launcher keeps the auth secret and CLI workspace     |
| `NEXT_MEM0_CLI_CWD`        | `$NEXT_MEM0_HOME/cli-workspace`                         | working directory the CLIs are spawned in                      |
| `OLLAMA_URL`               | `http://localhost:11434`                                | Ollama server                                                  |
| `OLLAMA_EMBED_MODEL`       | `nomic-embed-text`                                      | embedding model (see `EMBED_DIM`)                              |
| `EMBED_DIM`                | `768`                                                   | vector size of the embedding model                             |
| `NEXT_MEM0_MIN_SIMILARITY` | `0.45`                                                  | search hits below this cosine similarity are hidden            |

When running from source (`bun dev`), `NEXT_MEM0_CLI_CWD` defaults to `./data/cli-workspace` inside the repo.

The `messages.embedding` column is created as `vector(768)` by the first migration. To use a model
with another size, set `EMBED_DIM` **before** the first start (or add a migration that alters the
column) — vectors are not re-computed for existing rows.

## HTTP API

Every route needs the session cookie (sign in through the UI, or `POST /api/auth/sign-in/email`
with `{ email, password }` and keep the cookie).

- `POST /api/import` — what the extension uses; accepts a ChatGPT export (`conversations.json` or a
  single `mapping`), a Claude.ai export, or the generic `[{ title, messages: [{ role, content }] }]`
  shape. Optional `source` (`chatgpt` | `claude` | `codex` | `other`) and `replaceId`.
  `GET /api/import` returns `{ ok, conversations, messages, user }` as a health check.
- `GET /api/backup`, `POST /api/backup` — see [Backup](#backup-export--import-all-data).
- `POST /api/chat` — streams a CLI turn (used by the chat panel).
- `/api/auth/*` — Better Auth endpoints.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/import \
  -H 'content-type: application/json' \
  -d '{"conversation":[{"title":"Hello","messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello!"}]}]}'
```

## Run from source

```bash
git clone https://github.com/ala-garbaa-pro/mem0.git
cd mem0
bun install
ollama pull nomic-embed-text   # Ollama must be running
docker compose up -d           # Postgres 18 + pgvector on localhost:5432
bun dev
```

`bun dev` reads `.env` (copy `.env.example`); `bun scripts/*.ts` reads it too. Set `BETTER_AUTH_SECRET`
for anything you keep, and `NEXT_MEM0_ALLOW_SIGNUP=1` while you create your account.

### Schema changes

Tables are declared in `lib/schema.ts`. After editing it, `bun run db:generate --name <change>`
writes a new SQL migration into `drizzle/`; the app applies pending migrations on start
(`lib/drizzle.ts`). `bun run db:studio` opens Drizzle Studio on the configured database.

### Seed data

```bash
cp seed/users.json.example seed/users.json   # accounts (email / password / name); git-ignored
bun run db:seed:users                        # = bun run db:seed seed/users.json
bun run db:seed seed/example.json            # one account, a few sample conversations
bun run db:seed backup.json --user me@example.com --replace   # any /api/backup file
```

`scripts/seed.ts` (`lib/seed.ts`) accepts a `{ "users": [...] }` file (accounts only), a
`{ "user", "conversations" }` file, or a backup export. Accounts that do not exist are created through Better Auth when a
password is given; messages without vectors are embedded through Ollama. Conversations without an
`id` get a fresh one on every run, so re-seeding the same file adds copies — use `--replace` to start
that account from empty.

### Tests

```bash
bun run test:e2e                          # whole suite
bun run test:e2e tests/e2e/search.spec.ts
```

Playwright end-to-end tests in `tests/e2e/` run against a real `next dev` server on a separate
database (`next_mem0_test` on the same Postgres, wiped before each run; override with
`TEST_DATABASE_URL`), real Ollama embeddings, and the real `claude` / `codex` CLIs (those two specs
need the CLIs logged in). The global setup signs a test user up through the auth API and every test
runs with that session. They use the system Edge, so no browser download.

Playwright's runner needs Node.js; if only Bun is installed, `scripts/e2e.ts` downloads a portable
Node LTS into `.tools/` on first run.

Visual check of every page in light and dark mode (needs a running dev server):

```bash
node scripts/shots.mjs http://localhost:3000 .shots [conversationId]
```

### Layout

```
bin/next-mem0.mjs   npm entry point: starts the pre-built server, generates the auth secret
lib/schema.ts       Drizzle schema: Better Auth tables + conversations / messages (pgvector column)
lib/drizzle.ts      Postgres connection, database bootstrap, migrations
lib/db.ts           per-user store: conversations, messages, semantic search, backup export/import
lib/seed.ts         seed accounts + conversations from JSON (bun run db:seed)
lib/auth.ts         Better Auth server instance (email + password)
lib/session.ts      requireUser() / getRequestUser() helpers
lib/embeddings.ts   Ollama /api/embed client
lib/importers.ts    ChatGPT / Claude export parsers, transcript splitter
lib/cli.ts          spawns `claude -p` / `codex exec`, streams JSONL events, tracks session ids
proxy.ts            redirects signed-out page requests to /sign-in
app/(auth)/         sign-in, sign-up
app/(app)/          the signed-in app: home, conversation, new, import, search, backup
app/actions.ts      server actions (create / add message / rename / delete / import)
app/api/auth        Better Auth handler
app/api/backup      export / import everything
app/api/import      JSON import endpoint used by the browser extension
app/api/chat        streaming route the chat panel talks to
drizzle/            SQL migrations (applied automatically)
extension/          Chrome (MV3) extension: import the conversation in the current tab
```

### Publishing

The npm package ships the production build, not the sources: `prepublishOnly` runs
`next build --webpack` and the `files` list in `package.json` picks the build output, `public/`,
`bin/`, `extension/`, `drizzle/` and `docker-compose.yml`.

```bash
npm version minor
npm publish
```

## Roadmap

- Claude.ai and Gemini in the browser extension
- an MCP server (`add_memory`, `search_memory`, `list_memories`) over the same database, so your
  coding agents can read and write the store — see `reports/mem0.md` for the landscape

## License

[MIT](LICENSE)
