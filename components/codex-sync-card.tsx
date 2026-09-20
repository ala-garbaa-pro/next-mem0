import { DownloadIcon, TerminalIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";

const STEPS = (origin: string) => [
  { title: "Sign in once", cmd: `node next-mem0-sync.mjs login ${origin}`, note: "Your session is saved in ~/.next-mem0 — the password is not." },
  { title: "Pick the chats", cmd: "node next-mem0-sync.mjs codex", note: "Lists the threads in ~/.codex/sessions; --latest, --all or a thread id skip the picker." },
];

/**
 * "Import from the Codex CLI" — the chats live in ~/.codex on the user's machine, so a tiny
 * program has to run there and upload them. It is served from public/ and needs only Node.
 */
export function CodexSyncCard({ origin }: { origin: string }) {
  return (
    <section className="glass relative overflow-hidden rounded-2xl p-5">
      <span className="absolute inset-x-0 top-0 h-0.5 [background:linear-gradient(90deg,var(--vivid-a),var(--vivid-b),transparent)]" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="vivid-gradient flex size-10 shrink-0 items-center justify-center rounded-[12px] shadow-[0_8px_22px_rgba(59,130,246,0.28)] [background-image:linear-gradient(135deg,var(--vivid-b),var(--vivid-a))]">
            <TerminalIcon className="size-4.5" />
          </span>
          <div>
            <h2 className="font-heading text-base font-semibold tracking-tight">From the Codex CLI</h2>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Chats with <span className="font-mono text-xs">codex</span> in your terminal stay on your machine, so a
              small program runs there and sends them here. One file, no install — just Node 20+.
            </p>
          </div>
        </div>
        <a href="/next-mem0-sync.mjs" download className={buttonVariants({ size: "lg", className: "px-5" })}>
          <DownloadIcon data-icon="inline-start" />
          Download next-mem0-sync.mjs
        </a>
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {STEPS(origin).map((s, i) => (
          <li key={s.title} className="rounded-xl border border-glass-border bg-glass p-3.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="flex size-5 items-center justify-center rounded-full bg-vivid-a/15 text-[11px] font-semibold text-vivid-a">
                {i + 1}
              </span>
              {s.title}
            </p>
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-background/60 pr-1 pl-3 ring-1 ring-glass-border">
              <code className="min-w-0 flex-1 py-1.5 font-mono text-[12px] break-all text-foreground">{s.cmd}</code>
              <CopyButton text={s.cmd} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{s.note}</p>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-muted-foreground">
        Only your messages and Codex&apos;s answers are uploaded — reasoning, tool calls and Codex&apos;s own prompt
        scaffolding are stripped. Each import keeps the Codex thread id, so continuing the chat here resumes that same
        thread. Re-running skips what is already imported; <span className="font-mono">--replace</span> refreshes it.
      </p>
    </section>
  );
}
