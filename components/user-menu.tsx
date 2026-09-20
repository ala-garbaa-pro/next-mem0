"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronsUpDownIcon, DatabaseIcon, Loader2Icon, LogOutIcon } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/session";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const initial = user.email.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="glass glass-hover group/user flex w-full items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-left transition-all duration-150 outline-none hover:-translate-y-px focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-glass-hover"
      >
        <span className="relative shrink-0">
          <span className="vivid-gradient flex size-7 items-center justify-center rounded-[9px] font-heading text-xs font-semibold text-primary-foreground shadow-[0_4px_12px_rgba(59,130,246,0.3)]">
            {initial}
          </span>
          <span className="glow-dot absolute -right-0.5 -bottom-0.5 size-[7px] ring-2 ring-sidebar [animation-duration:2.6s]" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-medium text-foreground" title={user.email}>
            {user.email}
          </span>
          <span className="block truncate font-mono text-[10px] text-muted-foreground">Postgres · pgvector</span>
        </span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/user:text-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-(--anchor-width) min-w-56 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 pt-1.5 pb-2">
            <span className="block text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">Signed in as</span>
            <span className="mt-0.5 block truncate text-xs font-medium text-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2.5 rounded-lg px-2 py-1.5"
            render={<Link href="/backup" />}
          >
            <DatabaseIcon className="size-4 text-vivid-a" />
            <span className="flex-1">
              <span className="block text-sm">Backup</span>
              <span className="block text-[11px] text-muted-foreground">Export / import all data</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="gap-2.5 rounded-lg px-2 py-1.5"
          disabled={pending}
          closeOnClick={false}
          onClick={async () => {
            setPending(true);
            await signOut();
            router.replace("/sign-in");
            router.refresh();
          }}
        >
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <LogOutIcon className="size-4" />}
          <span className="text-sm">Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
