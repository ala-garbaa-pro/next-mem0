"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SendIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { PROVIDERS, type Provider } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Bubble } from "@/components/message-list";

const PROVIDER_LABEL: Record<Provider, string> = { claude: "Claude Code", codex: "Codex" };

type Event = { type: "delta"; text: string } | { type: "done"; sessionId: string } | { type: "error"; message: string };

/**
 * Chat panel that sends a prompt to the local `claude` / `codex` CLI through /api/chat,
 * streams the reply, and relies on the server to persist both turns.
 */
export function CliChat({
  conversationId,
  defaultProvider,
  hasSession,
}: {
  conversationId: string;
  defaultProvider: Provider;
  hasSession: boolean;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(defaultProvider);
  const [prompt, setPrompt] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [abort, setAbort] = useState<AbortController | null>(null);
  const busy = abort !== null;

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;
    const controller = new AbortController();
    setAbort(controller);
    setPendingPrompt(text);
    setPrompt("");
    setReply("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, provider, prompt: text }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as Event;
          if (ev.type === "delta") setReply((r) => r + ev.text);
          else if (ev.type === "error") throw new Error(ev.message);
          else if (ev.type === "done") finished = true;
        }
      }
      if (!finished) throw new Error("Stream ended before the CLI finished");
      toast.success("Turn saved");
      setPendingPrompt(null);
      setReply("");
      router.refresh();
    } catch (err) {
      if (controller.signal.aborted) {
        toast("Cancelled — nothing was saved");
      } else {
        toast.error(err instanceof Error ? err.message : String(err));
      }
      // Give the prompt back so it can be retried.
      setPrompt(text);
      setPendingPrompt(null);
    } finally {
      setAbort(null);
    }
  }

  return (
    <div className="space-y-3">
      {pendingPrompt !== null && (
        <div className="space-y-3">
          <Bubble role="user" meta={<span className="text-vivid-a/80">sending…</span>}>
            {pendingPrompt}
          </Bubble>
          <Bubble role="assistant" meta={<span>now</span>} className="border-glass-border bg-glass-hover">
            {/* animated gradient hairline while the CLI is producing text */}
            <span className="absolute inset-x-0 top-0 h-0.5 bg-[length:200%_100%] [animation:vivid-shift_2.4s_linear_infinite] [background-image:linear-gradient(90deg,transparent,var(--vivid-a),var(--vivid-b),transparent)]" />
            {reply}
            <span className="animate-caret ml-1 inline-block h-[17px] w-[9px] rounded-sm align-[-3px] [background:linear-gradient(135deg,var(--vivid-a),var(--vivid-b))]" />
          </Bubble>
          {!reply && (
            <div className="flex items-center gap-2.5 pl-14 text-[12.5px] text-vivid-a/80">
              <span className="inline-block size-3.5 rounded-full border-2 border-glass-border border-t-vivid-a [animation:spin_0.9s_linear_infinite]" />
              waiting for {PROVIDER_LABEL[provider]}…
            </div>
          )}
        </div>
      )}

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={busy}
        rows={3}
        placeholder={`Ask ${PROVIDER_LABEL[provider]}… (Ctrl/⌘ + Enter to send)`}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex items-center gap-2">
        <Select
          value={provider}
          onValueChange={(v) => setProvider(v as Provider)}
          items={PROVIDER_LABEL}
          disabled={busy}
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {busy
            ? "Streaming — every turn is saved when it finishes"
            : hasSession && provider === defaultProvider
              ? "Resumes the CLI session"
              : "Starts a new CLI session"}
        </span>
        {busy ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto border-destructive/40! bg-destructive/15! font-semibold text-destructive hover:bg-destructive/25!"
            onClick={() => abort?.abort()}
          >
            <SquareIcon data-icon="inline-start" className="size-3!" /> Stop
          </Button>
        ) : (
          <Button type="button" size="sm" className="ml-auto" onClick={() => void send()} disabled={!prompt.trim()}>
            <SendIcon data-icon="inline-start" /> Send
          </Button>
        )}
      </div>
    </div>
  );
}
