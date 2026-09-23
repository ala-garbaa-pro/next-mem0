# Import coverage checklist

Where your chats can come from. Four quadrants: **web** (the provider's data export) and
**CLI** (the session logs the local tool writes to disk), for ChatGPT and for Claude.

|                | Web                    | CLI                          |
| -------------- | ---------------------- | ---------------------------- |
| **ChatGPT**    | done                   | done (Codex CLI)             |
| **Claude**     | done                   | not started (Claude Code)    |

## ChatGPT — web

- [x] Parse `conversations.json` from an OpenAI data export (`parseChatGptConversation`, `lib/importers.ts`)
- [x] Walk `mapping` from `current_node` so only the active branch is imported
- [x] Drop system/tool nodes, keep `create_time` timestamps
- [x] Upload UI on `/import`, embeds every message locally
- [ ] Handle multi-branch exports (currently only the active branch survives)
- [ ] Attachments / images in the export are dropped silently — say so in the UI

## ChatGPT — CLI (Codex)

- [x] Read rollout JSONL from `~/.codex/sessions/YYYY/MM/DD/` (`public/next-mem0-sync.mjs`)
- [x] Strip Codex's injected blocks: environment context, plugin list, AGENTS.md, image tags (`lib/codex-rollout.ts`)
- [x] Server route `POST /api/import/codex`, pure parser with no filesystem access
- [x] Keep the Codex thread id in `conversations.cliSessionId` so a chat resumes the same thread
- [x] Sync program: `login` / `codex` / `status` / `logout`, flags `--latest --all --replace --limit --list --include-exec`
- [x] Downloadable from the Import page (`CodexSyncCard`)
- [ ] Incremental re-sync — today `--replace` re-uploads the whole thread

## Claude — web

- [x] Parse `conversations.json` from a claude.ai data export (`parseClaudeConversation`, `lib/importers.ts`)
- [x] Map `sender: human` → user, everything else → assistant
- [x] Handle both `text` and the `content[]` block form
- [ ] `projects.json` / `users.json` from the same export are ignored
- [ ] Artifacts inside a message arrive as raw markdown, not flagged

## Claude — CLI (Claude Code)  ← the gap

- [ ] Locate sessions: `~/.claude/projects/<slug>/<session-id>.jsonl`
- [ ] Write `lib/claude-session.ts` — a pure parser, same shape as `lib/codex-rollout.ts`
- [ ] Decide what to strip: system reminders, CLAUDE.md/AGENTS.md injection, tool_use / tool_result blocks, thinking blocks
- [ ] Route `POST /api/import/claude-code`, mirroring `app/api/import/codex/route.ts`
- [ ] Teach `next-mem0-sync.mjs` a `claude` command (env `CLAUDE_CONFIG_DIR`, default `~/.claude`)
- [ ] Store the session id in `cliSessionId` so `claude --resume <id>` works from the chat panel
- [ ] Hide headless runs by default, same as Codex's `--include-exec`
- [ ] Tests over a fixture JSONL

## Shared

- [x] `Source` union covers `claude | chatgpt | codex | gemini | other` (`lib/types.ts`)
- [ ] No `claude-code` source yet — decide whether it reuses `claude` or gets its own
- [ ] Gemini is in the union but has no importer
- [ ] De-duplication across sources (same chat imported from web and CLI)
