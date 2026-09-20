import { notFound } from "next/navigation";
import { getConversation, getMessages } from "@/lib/db";
import { isProvider } from "@/lib/providers";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddMessageForm } from "@/components/add-message-form";
import { CliChat } from "@/components/cli-chat";
import { ConversationActions } from "@/components/conversation-actions";
import { MessageList } from "@/components/message-list";
import { SourceBadge } from "@/components/source-badge";

export default async function ConversationPage(props: PageProps<"/c/[id]">) {
  const { id } = await props.params;
  const user = await requireUser();
  const conversation = await getConversation(user.id, id);
  if (!conversation) notFound();
  const messages = await getMessages(user.id, id);

  const defaultProvider = isProvider(conversation.source) ? conversation.source : "claude";
  const hasSession = Boolean(conversation.cliSessionId) && isProvider(conversation.source);

  return (
    <div className="animate-rise mx-auto flex max-w-[800px] flex-col gap-[22px] px-6 py-10">
      <header>
        <div className="flex items-start gap-2.5">
          <h1 className="min-w-0 flex-1 font-heading text-[23px] leading-[30px] font-bold tracking-[-0.025em]">
            {conversation.title}
          </h1>
          <ConversationActions conversation={conversation} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <SourceBadge source={conversation.source} className="h-[17px] px-2 text-[10px]" />
          <span>·</span>
          <span>{conversation.messageCount} messages</span>
          <span>·</span>
          <span>created {new Date(conversation.createdAt).toLocaleString()}</span>
          {hasSession && (
            <>
              <span>·</span>
              <span className="font-mono text-[oklch(0.5_0.11_200)] dark:text-[oklch(0.84_0.11_200)]">
                session {conversation.cliSessionId.slice(0, 8)}…
              </span>
            </>
          )}
        </div>
        {conversation.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {conversation.tags.map((t, i) => (
              <span
                key={t}
                className={cn(
                  "h-[23px] rounded-full border px-2.5 text-xs leading-[23px]",
                  i % 2 === 0 ? "border-vivid-a/30 bg-vivid-a/10 text-vivid-a" : "border-vivid-b/30 bg-vivid-b/12 text-vivid-b",
                )}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      <MessageList messages={messages} />

      <div className="hairline-x" />

      <Tabs defaultValue="cli">
        <TabsList>
          <TabsTrigger value="cli">Chat with CLI</TabsTrigger>
          <TabsTrigger value="manual">Add message</TabsTrigger>
        </TabsList>
        <TabsContent value="cli" className="pt-2">
          <CliChat conversationId={conversation.id} defaultProvider={defaultProvider} hasSession={hasSession} />
        </TabsContent>
        <TabsContent value="manual" className="pt-2">
          <AddMessageForm conversationId={conversation.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
