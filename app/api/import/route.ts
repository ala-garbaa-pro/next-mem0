import { revalidatePath } from "next/cache";
import { addMessages, createConversation, deleteConversation, getConversation, getStats } from "@/lib/db";
import { parseExportData } from "@/lib/importers";
import { isSource } from "@/lib/types";

/**
 * JSON import endpoint used by the browser extension (extension/).
 * No CORS headers on purpose: the extension calls this from its service worker with host
 * permissions, so an arbitrary web page can never post into the local store.
 *
 * GET  → { ok, conversations, messages }  (connection check)
 * POST { conversation, source?, replaceId? }
 *   conversation: anything parseExportData() understands — a ChatGPT `mapping` object as returned
 *                 by chatgpt.com itself, a Claude.ai chat, or { title, source, messages: [...] }.
 *   replaceId:    id of a previously imported conversation to delete first (re-import).
 */
export async function GET() {
  const stats = await getStats();
  return Response.json({ ok: true, conversations: stats.conversations, messages: stats.messages });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { conversation?: unknown; source?: unknown; replaceId?: unknown }
    | null;
  if (!body?.conversation) return Response.json({ error: "conversation is required" }, { status: 400 });

  const fallback = isSource(body.source) ? body.source : "other";
  let parsed;
  try {
    parsed = parseExportData(body.conversation, fallback);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  const c = parsed[0];
  if (!c?.messages.length) return Response.json({ error: "No messages found in conversation" }, { status: 422 });

  if (typeof body.replaceId === "string" && body.replaceId) {
    if (await getConversation(body.replaceId)) await deleteConversation(body.replaceId);
  }

  const convo = await createConversation({ title: c.title, source: c.source, createdAt: c.createdAt });
  const msgs = await addMessages(convo.id, c.messages);
  revalidatePath("/", "layout");
  return Response.json({
    ok: true,
    id: convo.id,
    title: convo.title,
    source: convo.source,
    messages: msgs.length,
    url: new URL(`/c/${convo.id}`, request.url).toString(),
  });
}
