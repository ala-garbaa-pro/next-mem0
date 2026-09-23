import { revalidatePath } from "next/cache";
import { parseAntigravitySteps, type AntigravitySessionMeta, type AntigravityStep } from "@/lib/antigravity-session";
import {
  addMessages,
  createConversation,
  deleteConversation,
  findConversationByCliSession,
  listConversations,
} from "@/lib/db";
import { getRequestUser } from "@/lib/session";

/**
 * Endpoint of the sync program (public/next-mem0-sync.mjs), which runs on the user's machine and
 * uploads Antigravity conversations — the Gemini CLI (`agy`) and its IDE — from the per-surface
 * `conversations` directories under ~/.gemini. Authenticated with the Better Auth session cookie
 * the program obtained through /api/auth/sign-in/email; no CORS on purpose.
 *
 * Stored with source "gemini", the same as a Gemini conversation saved from the browser extension;
 * the two are told apart by this one carrying a cliSessionId.
 *
 * GET  → { ok, user, imported: { [conversationId]: { id, title, messages } } }
 * POST { session: { id, name?, cwd?, startedAt?, updatedAt? }, steps: [{ idx, stepType, payload }],
 *        replace?: boolean }
 *        payload: the step_payload blob, base64 — it is protobuf, decoded server-side.
 *      → { ok, id, title, messages, url }  |  { ok, skipped: "exists", id, url }
 */
const unauthorized = () => Response.json({ error: "Not signed in — run: next-mem0-sync login" }, { status: 401 });

/** Steps carry whole model answers, so this is lower than the JSONL importers' row cap. */
const MAX_STEPS = 10_000;

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();
  const imported: Record<string, { id: string; title: string; messages: number }> = {};
  for (const c of await listConversations(user.id)) {
    // A Gemini chat saved from the extension has source "gemini" too, but no cliSessionId.
    if (c.source === "gemini" && c.cliSessionId) {
      imported[c.cliSessionId] = { id: c.id, title: c.title, messages: c.messageCount };
    }
  }
  return Response.json({ ok: true, user: user.email, imported });
}

function readSteps(raw: unknown): AntigravityStep[] | null {
  if (!Array.isArray(raw)) return null;
  const steps: AntigravityStep[] = [];
  for (const s of raw) {
    if (typeof s !== "object" || s === null) return null;
    const { idx, stepType, payload } = s as Record<string, unknown>;
    if (typeof stepType !== "number" || typeof payload !== "string") return null;
    steps.push({ idx: typeof idx === "number" ? idx : steps.length, stepType, payload });
  }
  return steps;
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as
    | { session?: Partial<AntigravitySessionMeta>; steps?: unknown; replace?: unknown }
    | null;
  const session = body?.session;
  if (!session || typeof session.id !== "string" || !session.id) {
    return Response.json({ error: "session.id is required" }, { status: 400 });
  }
  const steps = readSteps(body.steps);
  if (!steps?.length) {
    return Response.json({ error: "steps must be a non-empty array of { stepType, payload }" }, { status: 400 });
  }
  if (steps.length > MAX_STEPS) {
    return Response.json({ error: `Too many steps (max ${MAX_STEPS})` }, { status: 413 });
  }

  const meta: AntigravitySessionMeta = {
    id: session.id,
    name: typeof session.name === "string" ? session.name : undefined,
    cwd: typeof session.cwd === "string" ? session.cwd : undefined,
    startedAt: typeof session.startedAt === "string" ? session.startedAt : undefined,
    updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : undefined,
  };
  let parsed;
  try {
    parsed = parseAntigravitySteps(steps, meta);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  if (!parsed.messages.length) {
    return Response.json({ error: "No user/assistant messages in this conversation" }, { status: 422 });
  }

  const existing = await findConversationByCliSession(user.id, parsed.cliSessionId);
  if (existing && body.replace !== true) {
    return Response.json({
      ok: true,
      skipped: "exists",
      id: existing.id,
      title: existing.title,
      url: new URL(`/c/${existing.id}`, request.url).toString(),
    });
  }
  if (existing) await deleteConversation(user.id, existing.id);

  const convo = await createConversation(user.id, {
    title: parsed.title,
    source: "gemini",
    createdAt: parsed.createdAt,
    updatedAt: meta.updatedAt,
    cliSessionId: parsed.cliSessionId,
  });
  let msgs;
  try {
    msgs = await addMessages(user.id, convo.id, parsed.messages);
  } catch (err) {
    // Embedding failed (Ollama down, model not pulled): leave nothing behind, or the next run
    // would report this conversation as "already imported" while it holds no messages.
    await deleteConversation(user.id, convo.id);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
  revalidatePath("/", "layout");
  return Response.json({
    ok: true,
    replaced: Boolean(existing),
    id: convo.id,
    title: convo.title,
    messages: msgs.length,
    url: new URL(`/c/${convo.id}`, request.url).toString(),
  });
}
