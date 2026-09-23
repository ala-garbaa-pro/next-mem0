/** Unit tests for the Claude Code session parser. Run with `bun run test:unit`. */
import { describe, expect, test } from "bun:test";
import { cleanUserText, parseClaudeRows } from "./claude-session";

const user = (content: unknown, extra: Record<string, unknown> = {}) => ({
  type: "user",
  message: { role: "user", content },
  timestamp: "2026-01-01T10:00:00.000Z",
  sessionId: "sess-1",
  cwd: "C:\\work",
  ...extra,
});

const assistant = (content: unknown, extra: Record<string, unknown> = {}) => ({
  type: "assistant",
  message: { role: "assistant", content },
  timestamp: "2026-01-01T10:00:05.000Z",
  sessionId: "sess-1",
  ...extra,
});

describe("cleanUserText", () => {
  test("strips the system reminders Claude Code injects", () => {
    const raw = "<system-reminder>CLAUDE.md says…</system-reminder>\nrun the tests";
    expect(cleanUserText(raw)).toBe("run the tests");
  });

  test("rebuilds a slash command from its scaffolding", () => {
    const raw = "<command-name>/review</command-name>\n<command-message>review</command-message>\n<command-args>--fix</command-args>";
    expect(cleanUserText(raw)).toBe("/review --fix");
  });

  test("drops local command output", () => {
    expect(cleanUserText("<local-command-stdout>Set model to Opus</local-command-stdout>")).toBe("");
  });
});

describe("parseClaudeRows", () => {
  test("keeps the messages and reports the session id", () => {
    const c = parseClaudeRows([user("why is my build slow?"), assistant([{ type: "text", text: "Check the cache." }])], {
      id: "",
    });
    expect(c.cliSessionId).toBe("sess-1");
    // "claude", not a new source: /api/chat only resumes when conversation.source === provider.
    expect(c.source).toBe("claude");
    expect(c.messages).toHaveLength(2);
    expect(c.messages[0]).toMatchObject({ role: "user", content: "why is my build slow?" });
    expect(c.messages[1]).toMatchObject({ role: "assistant", content: "Check the cache." });
  });

  test("drops thinking, tool_use and tool_result blocks", () => {
    const c = parseClaudeRows(
      [
        user("read the file"),
        assistant([
          { type: "thinking", thinking: "the user wants the file" },
          { type: "text", text: "Reading it now." },
          { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } },
        ]),
        user([{ type: "tool_result", tool_use_id: "t1", content: "export const a = 1;" }]),
        assistant([{ type: "text", text: "It exports `a`." }]),
      ],
      { id: "" },
    );
    expect(c.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    // The two assistant rows around the tool call are one answer once the tool blocks are gone.
    expect(c.messages[1].content).toBe("Reading it now.\n\nIt exports `a`.");
  });

  test("skips sub-agent transcripts, injected context and compact summaries", () => {
    const c = parseClaudeRows(
      [
        user("real question"),
        user("sidechain chatter", { isSidechain: true }),
        user("injected context", { isMeta: true }),
        assistant([{ type: "text", text: "summary of the conversation so far" }], { isCompactSummary: true }),
        assistant([{ type: "text", text: "real answer" }]),
      ],
      { id: "" },
    );
    expect(c.messages.map((m) => m.content)).toEqual(["real question", "real answer"]);
  });

  test("prefers the generated title and takes the last one", () => {
    const c = parseClaudeRows(
      [
        user("a long first question that would otherwise become the title"),
        assistant([{ type: "text", text: "ok" }]),
        { type: "ai-title", aiTitle: "First guess", sessionId: "sess-1" },
        { type: "ai-title", aiTitle: "Build performance", sessionId: "sess-1" },
      ],
      { id: "" },
    );
    expect(c.title).toBe("Build performance");
  });

  test("falls back to the first user line when there is no title", () => {
    const c = parseClaudeRows([user("why is my build slow?\nmore detail"), assistant([{ type: "text", text: "ok" }])], {
      id: "",
    });
    expect(c.title).toBe("why is my build slow?");
  });

  test("drops a local command but keeps one the model answered", () => {
    const c = parseClaudeRows(
      [
        user("<command-name>/model</command-name><command-args></command-args>"),
        user("<local-command-stdout>Set model to Opus 5</local-command-stdout>"),
        user("<command-name>/review</command-name><command-args>--fix</command-args>"),
        assistant([{ type: "text", text: "Reviewed; two findings." }]),
      ],
      { id: "" },
    );
    expect(c.messages.map((m) => m.content)).toEqual(["/review --fix", "Reviewed; two findings."]);
  });

  test("throws when the rows carry no session id", () => {
    expect(() => parseClaudeRows([{ type: "user", message: { role: "user", content: "hi" } }], { id: "" })).toThrow(
      "no session id",
    );
  });

  test("uses the id and title the sync program already found", () => {
    const c = parseClaudeRows([user("hello", { sessionId: "" })], { id: "from-meta", name: "From meta" });
    expect(c.cliSessionId).toBe("from-meta");
    expect(c.title).toBe("From meta");
  });
});
