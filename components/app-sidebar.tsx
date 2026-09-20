import Image from "next/image";
import Link from "next/link";
import { PlusIcon, SearchIcon, UploadIcon } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import type { Conversation } from "@/lib/types";
import { ConversationNav } from "@/components/conversation-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

const NAV = [
  { href: "/new", label: "New", Icon: PlusIcon, hover: "hover:border-vivid-a/40 hover:bg-vivid-a/15" },
  { href: "/import", label: "Import", Icon: UploadIcon, hover: "hover:border-vivid-b/45 hover:bg-vivid-b/15" },
  { href: "/search", label: "Search", Icon: SearchIcon, hover: "hover:border-vivid-a/40 hover:bg-vivid-a/15" },
] as const;

export function AppSidebar({
  conversations,
  dbError,
  user,
}: {
  conversations: Conversation[];
  dbError: string | null;
  user: SessionUser;
}) {
  return (
    <aside className="sticky top-0 flex h-svh w-72 shrink-0 flex-col overflow-hidden border-r border-sidebar-border text-sidebar-foreground backdrop-blur-lg [background:var(--sidebar-gradient)]">
      <div className="px-4 pt-[18px] pb-3">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo/white-on-blue.png"
            alt="next-mem0"
            width={34}
            height={34}
            priority
            className="size-[34px] shrink-0 rounded-[11px] shadow-[0_6px_18px_rgba(10,124,255,0.28)]"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <Link href="/" className="vivid-text-static font-heading text-base font-semibold tracking-tight">
              next-mem0
            </Link>
            <p className="truncate text-xs text-muted-foreground">local AI memory</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-4 flex gap-1.5">
          {NAV.map(({ href, label, Icon, hover }) => (
            <Link
              key={href}
              href={href}
              className={`glass flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[10px] text-xs font-medium transition-all duration-150 hover:-translate-y-px ${hover}`}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="hairline-x" />

      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <span className="text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">Conversations</span>
        <span className="rounded-full bg-vivid-a/15 px-2 py-px text-[11px] font-semibold text-vivid-a">
          {conversations.length}
        </span>
      </div>

      {dbError ? (
        <div className="m-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="font-medium">Database error</p>
          <p className="mt-1 break-words">{dbError}</p>
        </div>
      ) : (
        <ConversationNav conversations={conversations} />
      )}

      <div className="mt-auto border-t border-sidebar-border px-3 py-3">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
