"use client";

import { useActionState } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { createConversationAction, type ActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SourceSelect } from "@/components/source-select";

const SPEAKERS = ["User", "Human", "Me", "Assistant", "AI", "Claude", "ChatGPT", "Codex", "Gemini", "System"];

export function NewConversationForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createConversationAction, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <section className="glass relative overflow-hidden rounded-2xl p-5">
        <span className="absolute inset-x-0 top-0 h-0.5 [background:linear-gradient(90deg,var(--vivid-a),transparent)]" />
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Leave empty to use the first message" />
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <SourceSelect className="h-9 w-full" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="tags">Tags</Label>
          <Input id="tags" name="tags" placeholder="comma, separated, tags" />
        </div>
      </section>

      <section className="glass relative overflow-hidden rounded-2xl p-5">
        <span className="absolute inset-x-0 top-0 h-0.5 [background:linear-gradient(90deg,var(--vivid-b),transparent)]" />
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="transcript">Transcript (optional)</Label>
          <span className="text-xs text-muted-foreground">split on speaker lines</span>
        </div>
        <Textarea
          id="transcript"
          name="transcript"
          rows={12}
          className="mt-2 font-mono text-xs leading-5"
          placeholder={`Paste a chat. Lines starting with a speaker are split into messages:\n\nUser: how do I center a div?\nAssistant: Use flexbox: display: flex; justify-content: center; align-items: center;\nUser: and vertically?\n...`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="mr-1">Recognised speakers:</span>
          {SPEAKERS.map((s, i) => (
            <span
              key={s}
              className={
                i < 3
                  ? "rounded-full border border-vivid-a/30 bg-vivid-a/10 px-2 py-px font-mono text-vivid-a"
                  : i < 9
                    ? "rounded-full border border-vivid-b/30 bg-vivid-b/12 px-2 py-px font-mono text-vivid-b"
                    : "rounded-full border border-glass-border bg-glass px-2 py-px font-mono"
              }
            >
              {s}:
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Without markers the whole text is saved as one user message. You can add more messages afterwards.
        </p>
      </section>

      {state && !state.ok && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending} className="px-5">
          {pending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <SparklesIcon data-icon="inline-start" />
          )}
          Create conversation
        </Button>
        <span className="text-xs text-muted-foreground">Messages are embedded locally as soon as they are saved.</span>
      </div>
    </form>
  );
}
