import { BotIcon, TerminalIcon, UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message, Role } from "@/lib/types";

const ICON = { user: UserIcon, assistant: BotIcon, system: TerminalIcon } as const;

export function RoleAvatar({ role }: { role: Role }) {
  const Icon = ICON[role];
  return (
    <span
      className={cn(
        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[9px]",
        role === "user"
          ? "text-vivid-ink shadow-[0_6px_16px_rgba(45,212,191,0.3)] [background:linear-gradient(135deg,var(--vivid-a),var(--vivid-b))]"
          : "glass text-[oklch(0.62_0.06_200)] dark:text-[oklch(0.82_0.06_200)]",
      )}
    >
      <Icon className="size-[15px]" />
    </span>
  );
}

/** Shared bubble chrome so the live (streaming) bubbles in the chat panel match stored messages. */
export function Bubble({
  role,
  meta,
  children,
  className,
  id,
}: {
  role: Role;
  meta: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const isUser = role === "user";
  return (
    <div
      id={id}
      className={cn(
        "relative flex gap-3 overflow-hidden rounded-2xl px-4 py-3.5 text-sm",
        isUser
          ? "border border-vivid-a/25 [background:linear-gradient(100deg,color-mix(in_oklch,var(--vivid-a)_14%,transparent),color-mix(in_oklch,var(--vivid-b)_14%,transparent))]"
          : "glass",
        role === "system" && "text-muted-foreground",
        className,
      )}
    >
      <RoleAvatar role={role} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="text-[13px] font-bold text-foreground capitalize">{role}</span>
          {meta}
        </div>
        <div className="mt-1 text-[14.5px] leading-[23px] break-words whitespace-pre-wrap">{children}</div>
      </div>
    </div>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  return (
    <li id={`m-${message.id}`} className="scroll-mt-24 target:[&>div]:ring-2 target:[&>div]:ring-vivid-a/50">
      <Bubble role={message.role} meta={<span>{new Date(message.createdAt).toLocaleString()}</span>}>
        {message.content}
      </Bubble>
    </li>
  );
}

export function MessageList({ messages }: { messages: Message[] }) {
  if (!messages.length) {
    return (
      <p className="rounded-2xl border border-dashed border-glass-border p-8 text-center text-sm text-muted-foreground">
        No messages yet. Add one below or start chatting with a CLI.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </ol>
  );
}
