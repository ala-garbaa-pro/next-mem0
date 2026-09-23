# Import coverage checklist

Where your chats can come from. Four quadrants: **web** and **CLI**, for ChatGPT and for Claude.
"Web" has two routes of its own — the provider's bulk data export, and the browser extension
grabbing the single conversation you are looking at.

|             | Web — data export | Web — extension | CLI                   |
| ----------- | ----------------- | --------------- | --------------------- |
| **ChatGPT** | done              | done            | done (Codex)          |
| **Claude**  | done              | done            | done (Claude Code)    |
| **Gemini**  | n/a               | done            | done (Antigravity)    |

## ChatGPT — web

- [x] Parse `conversations.json` from an OpenAI data export (`parseChatGptConversation`, `lib/importers.ts`)
- [x] Walk `mapping` from `current_node` so only the active branch is imported
- [x] Drop system/tool nodes, keep `create_time` timestamps
- [x] Upload UI on `/import`, embeds every message locally
- [x] Extension: `extension/content/chatgpt.js`, backend first then a DOM fallback
- [ ] Handle multi-branch exports (currently only the active branch survives)
- [ ] Attachments / images in the export are dropped silently — say so in the UI

## ChatGPT — CLI (Codex)

- [x] Read rollout JSONL from `~/.codex/sessions/YYYY/MM/DD/` (`public/next-mem0-sync.mjs`)
- [x] Strip Codex's injected blocks: environment context, plugin list, AGENTS.md, image tags (`lib/codex-rollout.ts`)
- [x] Server route `POST /api/import/codex`, pure parser with no filesystem access
- [x] Keep the Codex thread id in `conversations.cliSessionId` so a chat resumes the same thread
- [x] Sync program: `login` / `codex` / `status` / `logout`, flags `--latest --all --replace --limit --list --include-exec`
- [x] Downloadable from the Import page (`CliSyncCard`)
- [ ] Incremental re-sync — today `--replace` re-uploads the whole thread

## Claude — web

- [x] Parse `conversations.json` from a claude.ai data export (`parseClaudeConversation`, `lib/importers.ts`)
- [x] Map `sender: human` → user, everything else → assistant
- [x] Handle both `text` and the `content[]` block form
- [x] Extension: `extension/content/claude.js`, registered in `extension/sites.js`
- [x] Backend first (`/api/organizations` → `chat_conversations/<id>`), which returns the same
      `chat_messages` shape as the export, so the export parser is reused
- [x] DOM fallback for `/chat/<id>` and a shared `/share/<id>` snapshot, code blocks re-fenced
- [ ] `projects.json` / `users.json` from the same export are ignored
- [ ] Artifacts inside a message arrive as raw markdown, not flagged

## Claude — CLI (Claude Code)

- [x] Locate sessions: `~/.claude/projects/<slug>/<session-id>.jsonl`
- [x] Read every profile on the machine, not just `~/.claude`: one person often has several homes
      (`~/.config/claude-pro-*`), and reading only the default found 1 session where 159 exist.
      `CLAUDE_CONFIG_DIR` still wins and may name several; `--profile <name>` narrows the list.
- [x] Two-step picker: choose the account (name, signed-in email, session count, how many are
      already imported), then its conversations. Skipped when there is only one account, or when
      `--profile`, `--all`, `--latest`, `--list` or explicit ids already say what to import.
- [x] `lib/claude-session.ts` — a pure parser, same shape as `lib/codex-rollout.ts`
- [x] Strip system reminders, CLAUDE.md injection, slash-command scaffolding and local command output
- [x] Drop `thinking`, `tool_use` and `tool_result` blocks; merge the assistant rows a tool call split apart
- [x] Skip sub-agent transcripts (`isSidechain`), injected context (`isMeta`) and compact summaries
- [x] Drop local commands (`/model`, `/clear`) the model never saw; keep ones it answered
- [x] Title from the `ai-title` row, falling back to the first user line
- [x] Route `POST /api/import/claude-code`, mirroring `app/api/import/codex/route.ts`
- [x] `claude` command in `next-mem0-sync.mjs`, sharing the picker and flags with `codex`
- [x] Store the session id in `cliSessionId` so `claude --resume <id>` works from the chat panel
- [x] Hide headless runs by default (non-`cli` entrypoint), same as Codex's `--include-exec`
- [x] Unit tests: `lib/claude-session.test.ts` (`bun run test:unit`)
- [ ] Swept over 133 local sessions: 127 parsed, 6 empty, 0 threw. Re-check after a Claude Code
      format change — there is no fixture in the repo, the sweep ran against a real profile.

## Gemini — web

- [x] Extension: `extension/content/gemini.js`, matching `/app/<id>`, `/u/<n>/app/<id>` and `/share/<id>`
- [x] DOM only — gemini.google.com has no readable JSON endpoint, just a batchexecute RPC of
      positional arrays; turns are matched by the `<user-query>` / `<model-response>` tags rather
      than by class names, which churn between releases
- [ ] Only rendered turns are captured: Gemini virtualises long conversations, so the popup tells
      the user to scroll to the top first. An auto-scroll pass would fix it properly.
- [ ] Google takeout of Gemini chats is not parsed (no data-export path, unlike ChatGPT and Claude)

## Gemini — CLI (Antigravity)

- [x] Read conversations from the per-surface `conversations` directories under `~/.gemini`,
      covering all three surfaces: `antigravity-cli` (`agy`), `antigravity` and `antigravity-ide`
- [x] `lib/protobuf.ts` — a schemaless wire-format reader; Antigravity stores steps as protobuf
      with no `.proto` shipped, so text is addressed by field number (`19.2` user, `20.1` assistant)
- [x] `lib/antigravity-session.ts` — steps → conversation, keeping only step kinds 14 and 15
- [x] Drop the injected kinds that read like the user but are not: `90` (`<EPHEMERAL_MESSAGE>`) and
      `98` (`# Conversation History`), plus tool calls, plans and errors
- [x] Strip control characters — Postgres rejects NUL in a text column, and real conversations
      contain them
- [x] Route `POST /api/import/gemini-cli`; the client sends base64 steps, the server decodes
- [x] `gemini` command in `next-mem0-sync.mjs`, with the surface shown as the `kind` column
- [x] Unit tests over hand-encoded protobuf fixtures (`lib/antigravity-session.test.ts`)
- [ ] Needs Node 22.5+ for `node:sqlite` (the other commands still run on Node 20); the command
      says so rather than failing obscurely
- [ ] Field numbers are read off Antigravity 1.2.9. A format change makes an import come back
      empty rather than wrong, but there is no fixture in the repo to catch it — the sweep ran
      against `~/.gemini`: 13 conversations, 84 messages, 0 threw.
- [ ] No resume: `/api/chat` only knows the `claude` and `codex` providers, so an imported
      Antigravity chat cannot be continued in place. The id is stored for de-duplication only.
- [ ] `19.2` sometimes holds attached file context rather than the prompt, which makes for an ugly
      title on those conversations

## Shared

- [x] `Source` union covers `claude | chatgpt | codex | gemini | other` (`lib/types.ts`)
- [x] Claude Code imports use source `"claude"`, not a new value: `/api/chat` only resumes a CLI
      session when `conversation.source === provider`, and the provider for the `claude` CLI is
      `"claude"`. A claude.ai import is told apart by having no `cliSessionId`.
- [ ] De-duplication across sources (same chat imported from web and CLI)
