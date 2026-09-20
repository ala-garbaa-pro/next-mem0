import { listConversations } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { Conversation } from "@/lib/types";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  let conversations: Conversation[] = [];
  let dbError: string | null = null;
  try {
    conversations = await listConversations(user.id);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <AppSidebar conversations={conversations} dbError={dbError} user={user} />
      <main className="relative min-w-0 flex-1">{children}</main>
    </>
  );
}
