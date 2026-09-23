import { revalidatePath } from "next/cache";
import { addMessages, createConversation, deleteConversation, getStats } from "@/lib/db";
import { parseExportData } from "@/lib/importers";
import { getRequestUser } from "@/lib/session";
import { isSource } from "@/lib/types";

/**
 * JSON import endpoint used by the browser extension (extension/).
 * Needs the Better Auth session cookie — the extension sends the cookies of the signed-in browser.
 * No CORS headers on purpose: the extension calls this from its service worker with host
 * permissions, so an arbitrary web page can never post into the store.
 *
 * GET  → { ok, conversations, messages, user }  (connection check; 401 when not signed in)
 * POST { conversation, source?, replaceId? }
 *   conversation: anything parseExportData() understands — a ChatGPT `mapping` object as returned
 *                 by chatgpt.com itself, a Claude.ai chat, or { title, source, messages: [...] }.
 *   replaceId:    id of a previously imported conversation to delete first (re-import).
 */
const unauthorized = () =>
  Response.json({ error: "Not signed in — open next-mem0 in this browser and sign in" }, { status: 401 });

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();
  const stats = await getStats(user.id);
  return Response.json({ ok: true, conversations: stats.conversations, messages: stats.messages, user: user.email });
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();
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
    await deleteConversation(user.id, body.replaceId);
  }

  const convo = await createConversation(user.id, { title: c.title, source: c.source, createdAt: c.createdAt });
  let msgs;
  try {
    msgs = await addMessages(user.id, convo.id, c.messages);
  } catch (err) {
    // Embedding failed (Ollama down, model not pulled): don't leave an empty conversation behind.
    await deleteConversation(user.id, convo.id);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
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
