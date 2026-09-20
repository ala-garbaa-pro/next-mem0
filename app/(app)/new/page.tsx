import { NewConversationForm } from "@/components/new-conversation-form";

export default function NewConversationPage() {
  return (
    <div className="animate-rise mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="font-heading text-[23px] leading-[30px] font-bold tracking-[-0.025em]">New conversation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save a chat by hand, or create an empty one and continue it with the Claude / Codex CLI.
        </p>
      </div>
      <NewConversationForm />
    </div>
  );
}
