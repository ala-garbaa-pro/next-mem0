"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2Icon, DownloadIcon, FileJsonIcon, Loader2Icon, UploadCloudIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Restore = { ok: true; conversations: number; messages: number; reembedded: number; skipped: number };

export function BackupPanel({ stats }: { stats: { conversations: number; messages: number; database: string } | null }) {
  const router = useRouter();
  const [withVectors, setWithVectors] = useState(true);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Restore | { ok: false; error: string } | null>(null);

  async function restore() {
    if (!file) return;
    if (mode === "replace" && !confirm("Delete everything currently stored and replace it with the file?")) return;
    setPending(true);
    setResult(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch(`/api/backup?mode=${mode}`, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      setResult(res.ok ? { ok: true, ...json } : { ok: false, error: json.error || `Import failed (${res.status})` });
      if (res.ok) router.refresh();
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="glass relative overflow-hidden rounded-2xl p-5">
        <span className="absolute inset-x-0 top-0 h-0.5 [background:linear-gradient(90deg,var(--vivid-a),transparent)]" />
        <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">Export all data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {stats ? (
            <>
              <span className="font-semibold text-vivid-a">{stats.conversations}</span> conversations ·{" "}
              <span className="font-semibold text-vivid-a">{stats.messages.toLocaleString()}</span> messages from{" "}
              <code className="font-mono text-xs">{stats.database}</code>
            </>
          ) : (
            "Database unavailable"
          )}
        </p>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withVectors}
            onChange={(e) => setWithVectors(e.target.checked)}
            className="size-4 accent-[var(--vivid-a)]"
          />
          Include embedding vectors
          <span className="text-xs text-muted-foreground">
            (bigger file, but restoring needs no Ollama and is instant)
          </span>
        </label>
        <a
          href={`/api/backup${withVectors ? "" : "?vectors=0"}`}
          download
          className={cn(buttonVariants({ size: "lg" }), "mt-4 px-5")}
        >
          <DownloadIcon data-icon="inline-start" /> Download backup (.json)
        </a>
      </section>

      <section className="glass relative overflow-hidden rounded-2xl p-5">
        <span className="absolute inset-x-0 top-0 h-0.5 [background:linear-gradient(90deg,var(--vivid-b),transparent)]" />
        <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">Import all data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Load a backup made with the button above. Messages exported without vectors (or with a different
          embedding model) are re-embedded with Ollama.
        </p>

        <Label htmlFor="backup-file" className="sr-only">
          Backup file
        </Label>
        <label
          htmlFor="backup-file"
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDrop={() => setDragging(false)}
          className={cn(
            "mt-4 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-7 text-center transition-colors",
            dragging ? "border-vivid-b/60 bg-vivid-b/10" : "border-glass-border bg-glass hover:border-vivid-b/40 hover:bg-glass-hover",
          )}
        >
          <span className="vivid-gradient flex size-11 items-center justify-center rounded-[13px] shadow-[0_8px_22px_rgba(45,212,191,0.28)] [background-image:linear-gradient(135deg,var(--vivid-b),var(--vivid-a))]">
            <UploadCloudIcon className="size-5" />
          </span>
          {file ? (
            <span className="flex items-center gap-1.5 rounded-full border border-vivid-b/30 bg-vivid-b/12 px-2.5 py-0.5 font-mono text-xs text-vivid-b">
              <FileJsonIcon className="size-3" /> {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          ) : (
            <span className="text-sm">
              <span className="font-semibold text-vivid-b">Choose a backup file</span>
              <span className="text-muted-foreground"> or drop it here</span>
            </span>
          )}
          <input
            id="backup-file"
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>

        <fieldset className="mt-4 flex flex-wrap gap-4 text-sm">
          <legend className="sr-only">Import mode</legend>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} className="accent-[var(--vivid-a)]" />
            Merge
            <span className="text-xs text-muted-foreground">keep what is here, overwrite matching conversations</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="accent-[var(--destructive)]" />
            Replace
            <span className="text-xs text-muted-foreground">delete everything first</span>
          </label>
        </fieldset>

        {result && !result.ok && (
          <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {result.error}
          </div>
        )}
        {result && result.ok && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-ok/30 bg-ok/10 p-3 text-sm">
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-ok" />
            <span>
              Imported <b>{result.conversations}</b> conversations and <b>{result.messages.toLocaleString()}</b> messages
              {result.reembedded > 0 && <> ({result.reembedded.toLocaleString()} re-embedded)</>}
              {result.skipped > 0 && <>, skipped {result.skipped} unreadable</>}.
            </span>
          </div>
        )}

        <Button type="button" size="lg" className="mt-4 px-5" disabled={!file || pending} onClick={restore}>
          {pending ? (
            <>
              <Loader2Icon data-icon="inline-start" className="animate-spin" /> Importing…
            </>
          ) : (
            <>
              <UploadCloudIcon data-icon="inline-start" /> Import backup
            </>
          )}
        </Button>
      </section>
    </div>
  );
}
