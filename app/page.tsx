import Link from "next/link";
import { ArrowRightIcon, MessageSquareIcon, PlusIcon, UploadIcon } from "lucide-react";
import { getStats, listConversations } from "@/lib/db";
import { ollamaStatus } from "@/lib/embeddings";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { SearchForm } from "@/components/search-form";
import { SourceBadge } from "@/components/source-badge";

function Chip({ children, tone }: { children: React.ReactNode; tone: "a" | "b" }) {
  return (
    <code
      className={cn(
        "rounded-[7px] border px-[7px] py-0.5 font-mono text-[13px]",
        tone === "a" ? "border-vivid-a/25 bg-vivid-a/12 text-vivid-a" : "border-vivid-b/30 bg-vivid-b/15 text-vivid-b",
      )}
    >
      {children}
    </code>
  );
}

function Stat({
  label,
  accent,
  children,
  lift = true,
}: {
  label: string;
  accent: string;
  children: React.ReactNode;
  lift?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass relative flex-1 overflow-hidden rounded-2xl p-[18px] transition-transform duration-150",
        lift && "hover:-translate-y-[3px] hover:border-vivid-a/35",
      )}
    >
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div className="text-xs tracking-[0.04em] text-muted-foreground uppercase">{label}</div>
      {children}
    </div>
  );
}

export default async function Home() {
  const [stats, ollama, conversations] = await Promise.all([
    getStats().catch(() => null),
    ollamaStatus(),
    listConversations().catch(() => []),
  ]);
  const recent = conversations.slice(0, 8);

  return (
    <div className="animate-rise mx-auto flex max-w-4xl flex-col gap-[30px] px-6 py-11">
      <section className="flex flex-col gap-3.5">
        <span className="inline-flex h-[26px] items-center gap-2 self-start rounded-full border border-vivid-a/30 bg-vivid-a/10 px-3 text-[11.5px] font-semibold tracking-[0.04em] whitespace-nowrap text-vivid-a">
          <span className="glow-dot size-1.5" />
          100% LOCAL · NOTHING LEAVES THIS MACHINE
        </span>
        <h1 className="vivid-text font-heading text-[44px] leading-[50px] font-bold tracking-[-0.035em]">
          Your AI memory, on your disk
        </h1>
        <p className="max-w-[700px] text-[15px] leading-6 text-muted-foreground text-pretty">
          Every conversation is embedded with <Chip tone="a">{ollama.model}</Chip> and stored in LanceDB under{" "}
          <Chip tone="b">./data/lancedb</Chip>. Search by meaning, not just keywords.
        </p>
        <div className="mt-2">
          <SearchForm autoFocus />
        </div>
      </section>

      <section className="flex gap-3.5">
        <Stat label="Conversations" accent="var(--vivid-a)">
          <div className="vivid-text-static mt-2 font-heading text-[34px] leading-[38px] font-bold tracking-[-0.03em]">
            {stats?.conversations ?? "—"}
          </div>
        </Stat>
        <Stat label="Messages (vectors)" accent="var(--vivid-b)">
          <div className="vivid-text-static mt-2 font-heading text-[34px] leading-[38px] font-bold tracking-[-0.03em]">
            {stats ? stats.messages.toLocaleString() : "—"}
          </div>
        </Stat>
        <Stat label="Embeddings · Ollama" accent={ollama.ok ? "var(--ok)" : "var(--destructive)"} lift={false}>
          <div className="mt-3 flex items-center gap-2.5">
            <span
              className={cn(
                "size-[9px] shrink-0 rounded-full",
                ollama.ok
                  ? "bg-ok shadow-[0_0_12px_var(--ok)] [animation:vivid-pulse_2.2s_ease-in-out_infinite]"
                  : "bg-destructive shadow-[0_0_12px_var(--destructive)]",
              )}
            />
            <span className={cn("text-[15px] font-semibold", ollama.ok ? "text-ok" : "text-destructive")}>
              {ollama.ok ? "ready" : ollama.error}
            </span>
            {ollama.ok && <span className="truncate font-mono text-xs text-muted-foreground">{ollama.model}</span>}
          </div>
        </Stat>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">Recent</h2>
            <span className="h-0.5 w-[60px] rounded-sm [background:linear-gradient(90deg,var(--vivid-a),transparent)]" />
          </div>
          <div className="flex gap-2">
            <Link href="/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <PlusIcon data-icon="inline-start" /> New
            </Link>
            <Link href="/import" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hover:border-vivid-b/45! hover:bg-vivid-b/15!")}>
              <UploadIcon data-icon="inline-start" /> Import
            </Link>
          </div>
        </div>

        {recent.length === 0 ? (
          <div className="glass flex flex-col items-center gap-3 rounded-2xl py-10 text-center">
            <MessageSquareIcon className="size-8 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              Nothing stored yet. Paste a transcript, import a ChatGPT / Claude export, or start a chat with the
              Claude or Codex CLI.
            </p>
            <Link href="/new" className={buttonVariants()}>
              Create your first conversation <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3.5 sm:grid-cols-2">
            {recent.map((c) => (
              <li key={c.id} className="min-w-0">
                <Link
                  href={`/c/${c.id}`}
                  className="glass glass-hover flex h-full flex-col gap-2 overflow-hidden rounded-2xl p-[15px] hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-1.5">
                    <SourceBadge source={c.source} className="h-[17px] px-2 text-[10px]" />
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(c.updatedAt).toLocaleString()}</span>
                  </div>
                  <div className="truncate font-heading text-[14.5px] leading-5 font-semibold">{c.title}</div>
                  <div className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">
                    {c.preview || "No messages yet."}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
