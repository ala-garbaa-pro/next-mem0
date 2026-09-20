import Link from "next/link";
import { searchMessages } from "@/lib/db";
import type { SearchHit } from "@/lib/types";
import { SearchForm } from "@/components/search-form";
import { SourceBadge } from "@/components/source-badge";

function snippet(text: string, max = 320): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** Group hits by conversation, keep best distance first. */
function groupHits(hits: SearchHit[]) {
  const groups = new Map<string, { hits: SearchHit[]; best: number }>();
  for (const h of hits) {
    const g = groups.get(h.conversationId) ?? { hits: [], best: Infinity };
    g.hits.push(h);
    g.best = Math.min(g.best, h.distance);
    groups.set(h.conversationId, g);
  }
  return [...groups.values()].sort((a, b) => a.best - b.best);
}

export default async function SearchPage(props: PageProps<"/search">) {
  const { q } = await props.searchParams;
  const query = (Array.isArray(q) ? q[0] : q ?? "").trim();

  let hits: SearchHit[] = [];
  let error: string | null = null;
  if (query) {
    try {
      hits = await searchMessages(query, 30);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  const groups = groupHits(hits);

  return (
    <div className="animate-rise mx-auto flex max-w-4xl flex-col gap-4 px-6 py-10">
      <h1 className="font-heading text-[23px] leading-[30px] font-bold tracking-[-0.025em]">Semantic search</h1>
      <SearchForm defaultValue={query} autoFocus size="md" />

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {query && !error && (
        <p className="text-[12.5px] text-muted-foreground">
          <span className="font-semibold text-vivid-a">{hits.length} matching messages</span> in {groups.length}{" "}
          conversations
          {hits.length === 0 && <span className="ml-2">· Try a different phrasing — search is by meaning, not keywords.</span>}
        </p>
      )}

      <ul className="space-y-3.5">
        {groups.map(({ hits: group }) => {
          const convo = group[0].conversation;
          return (
            <li key={group[0].conversationId}>
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center gap-2.5">
                  {convo && <SourceBadge source={convo.source} className="h-[17px] px-2 text-[10px]" />}
                  <Link
                    href={`/c/${group[0].conversationId}#m-${group[0].id}`}
                    className="min-w-0 truncate font-heading text-[14.5px] font-semibold transition-colors hover:text-vivid-a"
                  >
                    {convo?.title ?? "Unknown conversation"}
                  </Link>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {convo ? new Date(convo.updatedAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {group.map((h) => {
                    const sim = Math.max(0, Math.min(1, 1 - h.distance));
                    return (
                      <li key={h.id}>
                        <Link
                          href={`/c/${h.conversationId}#m-${h.id}`}
                          className="glass glass-hover block rounded-[13px] px-3.5 py-3"
                        >
                          <span className="flex items-center gap-2.5 text-xs">
                            <span className="font-bold text-foreground capitalize">{h.role}</span>
                            <span className="font-mono text-vivid-a">{sim.toFixed(2)}</span>
                            <span className="block h-[5px] max-w-[170px] flex-1 overflow-hidden rounded-full bg-glass-hover">
                              <span
                                className="animate-grow block h-full rounded-full [background:linear-gradient(90deg,var(--vivid-a),var(--vivid-b))]"
                                style={{ width: `${Math.round(sim * 100)}%` }}
                              />
                            </span>
                          </span>
                          <span className="mt-[7px] block text-[13.5px] leading-[22px] text-foreground/85">
                            {snippet(h.content)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
