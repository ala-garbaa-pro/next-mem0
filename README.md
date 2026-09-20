# next-mem0

**Local AI conversation memory.** Keep every conversation you have with ChatGPT, Claude, Codex or any
other assistant on your own disk, and search all of it by meaning.

[![npm](https://img.shields.io/npm/v/next-mem0)](https://www.npmjs.com/package/next-mem0)
[![license](https://img.shields.io/npm/l/next-mem0)](LICENSE)

- **Private by design** — everything stays on your machine. The vector store is an embedded
  [LanceDB](https://lancedb.com) directory, embeddings come from [Ollama](https://ollama.com) on
  localhost. No cloud, no Docker, no API keys.
- **Semantic search** — ask "that time I debugged the Postgres connection pool" and find the
  conversation even if those words never appeared in it.
- **Many ways in**
  - one-click **browser extension** that saves the ChatGPT conversation open in the current tab
  - import a **ChatGPT** or **Claude.ai** data export (`conversations.json`)
  - paste a transcript (`User:` / `Assistant:` lines are split into messages) or add messages by hand
  - **chat with the `claude` or `codex` CLI** from inside the app; every turn is stored and the CLI
    session is resumed on the next message, so the assistant keeps its context too

## Quick start

You need [Ollama](https://ollama.com) running with the embedding model, and Node.js 20.9+ (or Bun).

```bash
ollama pull nomic-embed-text
npx next-mem0          # or: bunx next-mem0
```

Open <http://localhost:3000>. Your data lives in `~/.next-mem0/` (see [Configuration](#configuration)).

```
next-mem0 [-p <port>] [-H <hostname>]
```

Any other flag is passed straight to `next start`.

## Browser extension

The `extension/` folder is a plain Manifest V3 extension (no build step) that imports the conversation
open in the current tab into your local next-mem0. It ships inside the npm package too:

1. Open `chrome://extensions` (Chrome / Edge / Brave), turn on **Developer mode**.
2. **Load unpacked** → pick `extension/` (from this repo, or from
   `node_modules/next-mem0/extension` after `npm i -g next-mem0`).
3. With next-mem0 running, open a chat on chatgpt.com and click the extension icon → **Import**.
   Re-clicking later replaces the saved copy with the current state of the chat.

If the app is not on `http://localhost:3000`, set the URL from the ⚙ in the popup.
Details in [`extension/README.md`](extension/README.md). Claude.ai and Gemini support are next.

## Chat through your CLIs

If the [`claude`](https://docs.anthropic.com/en/docs/claude-code) or
[`codex`](https://github.com/openai/codex) CLI is installed and logged in, the **New** page lets you
talk to it from the app. next-mem0 runs one headless turn per message (`claude -p` / `codex exec`),
streams the answer back, and stores the CLI's session id so the next turn resumes the same session.
The CLIs run in `MEM0_CLI_CWD` (default `~/.next-mem0/cli-workspace`).

## Configuration

All optional, set as environment variables.

| Variable              | Default                        | What it does                                        |
| --------------------- | ------------------------------ | --------------------------------------------------- |
| `MEM0_HOME`           | `~/.next-mem0`                 | base directory for the two paths below              |
| `MEM0_DB_PATH`        | `$MEM0_HOME/lancedb`           | where LanceDB writes its tables                     |
| `MEM0_CLI_CWD`        | `$MEM0_HOME/cli-workspace`     | working directory the CLIs are spawned in           |
| `OLLAMA_URL`          | `http://localhost:11434`       | Ollama server                                       |
| `OLLAMA_EMBED_MODEL`  | `nomic-embed-text`             | embedding model (change `EMBED_DIM` to match)       |
| `EMBED_DIM`           | `768`                          | vector size of the embedding model                  |
| `MEM0_MIN_SIMILARITY` | `0.45`                         | search hits below this cosine similarity are hidden |

When running from source (`bun dev`), `MEM0_DB_PATH` and `MEM0_CLI_CWD` default to `./data/…`
inside the repo instead of `~/.next-mem0`.

Changing the embedding model after data exists requires deleting the LanceDB directory — vectors are
not re-computed.

## HTTP API

`POST /api/import` is what the extension uses; you can call it from anything else too:

```bash
curl -X POST http://localhost:3000/api/import \
  -H 'content-type: application/json' \
  -d '{"conversation":[{"title":"Hello","messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello!"}]}]}'
```

`conversation` accepts a ChatGPT export (`conversations.json` or a single `mapping`), a Claude.ai
export, or the generic `[{ title, messages: [{ role, content }] }]` shape. Optional `source`
(`chatgpt` | `claude` | `codex` | `other`) and `replaceId` (id of a previous import to overwrite).
`GET /api/import` returns `{ ok, conversations, messages }` as a health check.

## Run from source

```bash
git clone https://github.com/ala-garbaa-pro/mem0.git
cd mem0
bun install
ollama pull nomic-embed-text   # Ollama must be running
bun dev
```

### Tests

```bash
bun run test:e2e                          # whole suite
bun run test:e2e tests/e2e/search.spec.ts
```

Playwright end-to-end tests in `tests/e2e/` run against a real `next dev` server with an isolated
LanceDB directory (`.test-data/`), real Ollama embeddings, and the real `claude` / `codex` CLIs
(those two specs need the CLIs logged in). They use the system Edge, so no browser download.

Playwright's runner needs Node.js; if only Bun is installed, `scripts/e2e.ts` downloads a portable
Node LTS into `.tools/` on first run.

Visual check of every page in light and dark mode (needs a running dev server):

```bash
node scripts/shots.mjs http://localhost:3000 .shots [conversationId]
```

### Layout

```
bin/next-mem0.mjs  npm entry point: starts the pre-built server, points data at ~/.next-mem0
lib/db.ts          LanceDB store: conversations + messages tables, semantic search
lib/embeddings.ts  Ollama /api/embed client
lib/importers.ts   ChatGPT / Claude export parsers, transcript splitter
lib/cli.ts         spawns `claude -p` / `codex exec`, streams JSONL events, tracks session ids
app/actions.ts     server actions (create / add message / rename / delete / import)
app/api/import     JSON import endpoint used by the browser extension
app/api/chat       streaming route the chat panel talks to
extension/         Chrome (MV3) extension: import the conversation in the current tab
```

### Publishing

The npm package ships the production build, not the sources: `prepublishOnly` runs
`next build --webpack` (webpack emits plain `require()`s for the native LanceDB / Arrow packages,
which resolve from the consumer's `node_modules`) and the `files` list in `package.json` picks the
build output, `public/`, `bin/` and `extension/`.

```bash
npm version patch
npm publish
```

## Roadmap

- Claude.ai and Gemini in the browser extension
- an MCP server (`add_memory`, `search_memory`, `list_memories`) over the same LanceDB directory, so
  your coding agents can read and write the store — see `reports/mem0.md` for the landscape

## License

[MIT](LICENSE)
