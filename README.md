# mem0 — local AI conversation memory

Store every AI conversation you have on your own disk and search it by meaning.

- **Vector store:** [LanceDB](https://lancedb.com) embedded, files under `./data/lancedb`. No Docker, no server.
- **Embeddings:** [Ollama](https://ollama.com) running `nomic-embed-text` on localhost. Nothing leaves the machine.
- **Ways in:**
  - paste a transcript (`User:` / `Assistant:` lines are split into messages) or add messages one by one
  - import a ChatGPT or Claude.ai data export (`conversations.json`), or generic `[{ title, messages: [{ role, content }] }]`
  - chat with the locally installed **`claude`** or **`codex`** CLI from inside the app; every turn is saved and the CLI session is resumed on the next message

## Run

```bash
ollama pull nomic-embed-text   # once; Ollama must be running
bun install
bun dev
```

Open http://localhost:3000.

## Configuration (all optional)

| Env var               | Default                   | What it does                                  |
| --------------------- | ------------------------- | --------------------------------------------- |
| `MEM0_DB_PATH`        | `./data/lancedb`          | where LanceDB writes its tables               |
| `OLLAMA_URL`          | `http://localhost:11434`  | Ollama server                                 |
| `OLLAMA_EMBED_MODEL`  | `nomic-embed-text`        | embedding model (change `EMBED_DIM` to match) |
| `EMBED_DIM`           | `768`                     | vector size of the embedding model            |
| `MEM0_MIN_SIMILARITY` | `0.45`                    | search hits below this cosine similarity are hidden |
| `MEM0_CLI_CWD`        | `./data/cli-workspace`    | working directory the CLIs are spawned in     |

Changing the embedding model after data exists requires deleting `./data/lancedb` (vectors are not re-computed).

## Tests

```bash
bun run test:e2e            # whole suite
bun run test:e2e tests/e2e/search.spec.ts
```

Playwright end-to-end tests in `tests/e2e/` run against a real `next dev` server with an isolated
LanceDB directory (`.test-data/`), real Ollama embeddings, and the real `claude` / `codex` CLIs
(those two tests need the CLIs logged in). They use the system Edge, so no browser download.

Playwright's runner needs Node.js; this machine only has Bun, so `scripts/e2e.ts` downloads a portable
Node LTS into `.tools/` on first run (or uses `node` from PATH if present).

Visual check of every page in light and dark mode (needs a running dev server):

```bash
.tools/node/node.exe scripts/shots.mjs http://localhost:3000 .shots [conversationId]
```

## Layout

```
lib/db.ts          LanceDB store: conversations + messages tables, semantic search
lib/embeddings.ts  Ollama /api/embed client
lib/importers.ts   ChatGPT / Claude export parsers, transcript splitter
lib/cli.ts         spawns `claude -p` / `codex exec`, streams JSONL events, tracks session ids
app/actions.ts     server actions (create / add message / rename / delete / import)
app/api/chat       streaming route the chat panel talks to
```

## Next step: expose it to your agents

The store is a plain LanceDB directory, so a small MCP server (`add_memory`, `search_memory`, `list_memories`)
can sit next to this app and read/write the same tables — see `reports/mem0.md` for the landscape.
