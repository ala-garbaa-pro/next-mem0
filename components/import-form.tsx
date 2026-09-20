"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCircle2Icon, FileJsonIcon, Loader2Icon, UploadCloudIcon } from "lucide-react";
import { importFilesAction, type ImportResult } from "@/app/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SourceSelect } from "@/components/source-select";

const GUIDES = [
  { name: "ChatGPT", path: "Settings → Data controls → Export", tone: "text-emerald-700 dark:text-[oklch(0.84_0.13_165)] bg-[rgba(52,211,153,0.18)]" },
  { name: "Claude", path: "Settings → Privacy → Export data", tone: "text-orange-700 dark:text-[oklch(0.83_0.13_60)] bg-[rgba(251,146,60,0.18)]" },
  { name: "Generic", path: "[{ title, messages: [{ role, content }] }]", tone: "text-muted-foreground bg-glass-hover" },
];

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportResult | null, FormData>(importFilesAction, null);
  const [files, setFiles] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-4">
      <section className="glass relative overflow-hidden rounded-2xl p-5">
        <span className="absolute inset-x-0 top-0 h-0.5 [background:linear-gradient(90deg,var(--vivid-a),transparent)]" />
        <Label htmlFor="files">Export files (.json)</Label>

        <label
          htmlFor="files"
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDrop={() => setDragging(false)}
          className={cn(
            "mt-2 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors",
            dragging ? "border-vivid-a/60 bg-vivid-a/10" : "border-glass-border bg-glass hover:border-vivid-a/40 hover:bg-glass-hover",
          )}
        >
          <span className="vivid-gradient flex size-11 items-center justify-center rounded-[13px] shadow-[0_8px_22px_rgba(45,212,191,0.28)] [background-image:linear-gradient(135deg,var(--vivid-a),var(--vivid-b))]">
            <UploadCloudIcon className="size-5" />
          </span>
          {files.length ? (
            <ul className="flex flex-wrap justify-center gap-1.5">
              {files.map((f) => (
                <li key={f} className="flex items-center gap-1.5 rounded-full border border-vivid-a/30 bg-vivid-a/10 px-2.5 py-0.5 font-mono text-xs text-vivid-a">
                  <FileJsonIcon className="size-3" /> {f}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm">
              <span className="font-semibold text-vivid-a">Choose files</span>
              <span className="text-muted-foreground"> or drop them here</span>
            </span>
          )}
          <span className="text-xs text-muted-foreground">conversations.json · several files at once is fine</span>
          <input
            id="files"
            name="files"
            type="file"
            accept=".json,application/json"
            multiple
            required
            className="sr-only"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))}
          />
        </label>

        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {GUIDES.map((g) => (
            <li key={g.name} className="rounded-xl border border-glass-border bg-glass px-3 py-2.5">
              <span className={cn("rounded-full px-2 py-px text-[10px] font-semibold", g.tone)}>{g.name}</span>
              <p className="mt-1.5 font-mono text-[11px] leading-4 break-words text-muted-foreground">{g.path}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass relative overflow-hidden rounded-2xl p-5">
        <span className="absolute inset-x-0 top-0 h-0.5 [background:linear-gradient(90deg,var(--vivid-b),transparent)]" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Label>Fallback source (for generic files)</Label>
            <SourceSelect defaultValue="other" className="h-9 w-44" />
          </div>
          <Button type="submit" size="lg" disabled={pending} className="px-5">
            {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <UploadCloudIcon data-icon="inline-start" />}
            {pending ? "Embedding & storing…" : "Import"}
          </Button>
        </div>
      </section>

      {state && (
        <div
          className={cn(
            "rounded-2xl border p-4 text-sm",
            state.ok ? "border-ok/30 bg-ok/10" : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {state.error && <p className="font-medium">{state.error}</p>}
          {state.imported && state.imported.length > 0 && (
            <>
              <p className="flex items-center gap-2 font-semibold text-ok">
                <CheckCircle2Icon className="size-4" />
                Imported {state.imported.length} conversation{state.imported.length === 1 ? "" : "s"}
                {state.skipped ? ` (${state.skipped} empty skipped)` : ""}
              </p>
              <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
                {state.imported.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/c/${c.id}`}
                      className="glass glass-hover flex items-center gap-2 rounded-xl px-3 py-2 text-foreground"
                    >
                      <FileJsonIcon className="size-3.5 text-vivid-a" />
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.messages} messages</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {state.ok && state.imported?.length === 0 && <p>No conversations found in those files.</p>}
        </div>
      )}
    </form>
  );
}
