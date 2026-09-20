import { revalidatePath } from "next/cache";
import { isProvider, runCli } from "@/lib/cli";
import { addMessages, getConversation, updateConversation } from "@/lib/db";
import { getRequestUser } from "@/lib/session";

/**
 * POST { conversationId, provider: "claude" | "codex", prompt }
 * Streams NDJSON events ({type:"delta"|"done"|"error"}) from the CLI and persists the turn.
 */
export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as
    | { conversationId?: string; provider?: string; prompt?: string }
    | null;
  const conversationId = body?.conversationId ?? "";
  const prompt = (body?.prompt ?? "").trim();
  const provider = body?.provider;
  if (!conversationId || !prompt || !isProvider(provider)) {
    return Response.json({ error: "conversationId, provider and prompt are required" }, { status: 400 });
  }
  const convo = await getConversation(user.id, conversationId);
  if (!convo) return Response.json({ error: "Conversation not found" }, { status: 404 });

  // Only resume a CLI session that was created by the same provider.
  const resumeId = convo.source === provider ? convo.cliSessionId : "";
  const encoder = new TextEncoder();

  // Killing the CLI when the client disconnects means a cancelled turn is never persisted.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: unknown) => {
        if (abort.signal.aborted) return;
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };
      try {
        for await (const ev of runCli(provider, prompt, resumeId, abort.signal)) {
          if (ev.type === "done") {
            await addMessages(user.id, conversationId, [
              { role: "user", content: prompt },
              { role: "assistant", content: ev.text },
            ]);
            await updateConversation(user.id, conversationId, {
              cliSessionId: ev.sessionId,
              source: provider,
            });
            revalidatePath("/", "layout");
            send({ type: "done", sessionId: ev.sessionId });
          } else {
            send(ev);
          }
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
