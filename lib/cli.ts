/**
 * Bridge to the locally installed `claude` and `codex` CLIs.
 * Runs one prompt in headless mode, streams text back, and reports the session/thread id so the
 * next turn can be resumed with the CLI's own context.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import type { Provider } from "./providers";

export type { Provider } from "./providers";
export { PROVIDERS, isProvider } from "./providers";

export type CliEvent =
  | { type: "delta"; text: string }
  | { type: "done"; text: string; sessionId: string }
  | { type: "error"; message: string };

/** Working directory the CLIs run in; kept outside the repo so they don't pick up project files. */
const CLI_CWD = process.env.MEM0_CLI_CWD ?? path.join(process.cwd(), "data", "cli-workspace");

function buildArgs(provider: Provider, resumeId: string): string[] {
  if (provider === "claude") {
    return [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      ...(resumeId ? ["--resume", resumeId] : []),
    ];
  }
  // codex exec [resume <id>] - --json  ("-" = read prompt from stdin)
  return resumeId
    ? ["exec", "resume", "--json", "--skip-git-repo-check", resumeId, "-"]
    : ["exec", "--json", "--skip-git-repo-check", "-"];
}

type Line = Record<string, unknown>;
const obj = (v: unknown): v is Line => typeof v === "object" && v !== null;

/** Extract (delta text | final text | session id) from one JSONL event of the given CLI. */
function interpret(provider: Provider, ev: Line): { delta?: string; final?: string; sessionId?: string } {
  if (provider === "claude") {
    if (ev.type === "stream_event" && obj(ev.event)) {
      const e = ev.event;
      if (e.type === "content_block_delta" && obj(e.delta) && e.delta.type === "text_delta") {
        return { delta: String(e.delta.text ?? "") };
      }
    }
    if (ev.type === "result") {
      return {
        final: typeof ev.result === "string" ? ev.result : "",
        sessionId: typeof ev.session_id === "string" ? ev.session_id : undefined,
      };
    }
    return {};
  }
  // codex
  if (ev.type === "thread.started") return { sessionId: String(ev.thread_id ?? "") };
  if (ev.type === "item.completed" && obj(ev.item) && ev.item.type === "agent_message") {
    return { final: String(ev.item.text ?? "") };
  }
  if (ev.type === "error" || ev.type === "turn.failed") {
    const msg = obj(ev.error) ? String(ev.error.message ?? "") : String(ev.message ?? "");
    throw new Error(msg || "codex reported an error");
  }
  return {};
}

export async function* runCli(
  provider: Provider,
  prompt: string,
  resumeId = "",
  signal?: AbortSignal,
): AsyncGenerator<CliEvent> {
  await fs.mkdir(CLI_CWD, { recursive: true });
  const child = spawn(provider, buildArgs(provider, resumeId), {
    cwd: CLI_CWD,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const onAbort = () => child.kill();
  signal?.addEventListener("abort", onAbort, { once: true });

  let stderr = "";
  child.stderr.on("data", (d: Buffer) => {
    stderr += d.toString();
  });
  child.stdin.end(prompt);

  let streamed = "";
  let finalText = "";
  let sessionId = resumeId;
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      let ev: unknown;
      try {
        ev = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!obj(ev)) continue;
      const r = interpret(provider, ev);
      if (r.sessionId) sessionId = r.sessionId;
      if (r.delta) {
        streamed += r.delta;
        yield { type: "delta", text: r.delta };
      }
      if (r.final !== undefined) {
        finalText = finalText ? `${finalText}\n\n${r.final}` : r.final;
      }
    }
  } catch (err) {
    child.kill();
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
    return;
  }

  const code = await new Promise<number | null>((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once("close", resolve);
  });
  signal?.removeEventListener("abort", onAbort);

  if (signal?.aborted) {
    yield { type: "error", message: "Cancelled" };
    return;
  }

  const text = streamed || finalText;
  if (!text) {
    const hint = stderr.trim().split("\n").slice(-5).join("\n");
    yield {
      type: "error",
      message: `${provider} exited with code ${code} and no reply.${hint ? `\n${hint}` : ""}`,
    };
    return;
  }
  // If we streamed partial deltas, the assembled text is authoritative; otherwise use the final.
  yield { type: "done", text, sessionId };
}
