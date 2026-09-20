"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { FilterIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SourceBadge } from "@/components/source-badge";

export function ConversationNav({ conversations }: { conversations: Conversation[] }) {
  const pathname = usePathname();
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return conversations;
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(f) || c.tags.some((t) => t.toLowerCase().includes(f)),
    );
  }, [conversations, filter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-1.5 pb-2">
        <label className="glass flex h-8 items-center gap-2 rounded-[10px] px-2.5 text-muted-foreground focus-within:border-vivid-a/50">
          <FilterIcon className="size-3.5 shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title or tag…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-[3px] px-2 pb-2">
          {visible.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              {conversations.length ? "No matches." : "Nothing stored yet."}
            </li>
          )}
          {visible.map((c) => {
            const href = `/c/${c.id}`;
            const active = pathname === href;
            return (
              <li key={c.id}>
                <Link
                  href={href}
                  className={cn(
                    "relative block overflow-hidden rounded-[10px] border border-transparent px-[11px] py-2 text-sm transition-all duration-150",
                    active
                      ? "border-vivid-a/30 font-medium [background:linear-gradient(100deg,color-mix(in_oklch,var(--vivid-a)_16%,transparent),color-mix(in_oklch,var(--vivid-b)_14%,transparent))]"
                      : "hover:border-glass-border hover:bg-glass-hover",
                  )}
                >
                  {active && (
                    <span className="absolute inset-y-0 left-0 w-[3px] [background:linear-gradient(180deg,var(--vivid-a),var(--vivid-b))]" />
                  )}
                  <span className="block truncate leading-5">{c.title}</span>
                  <span className="mt-[3px] flex items-center gap-1.5 text-xs text-muted-foreground">
                    <SourceBadge source={c.source} className="h-4 px-[7px] text-[10px]" />
                    <span>{c.messageCount} msgs</span>
                    <span className="ml-auto">{new Date(c.updatedAt).toLocaleDateString()}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
