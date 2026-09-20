import { revalidatePath } from "next/cache";
import { parseCodexRows, type CodexSessionMeta } from "@/lib/codex-rollout";
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
 * uploads Codex CLI session logs from ~/.codex/sessions. Authenticated with the Better Auth session
 * cookie the program obtained through /api/auth/sign-in/email; no CORS on purpose.
 *
 * GET  → { ok, user, imported: { [codexThreadId]: { id, title, messages } } }
 *        (which threads this account already holds, so the program can mark them)
 * POST { session: { id, name?, cwd?, startedAt?, updatedAt? }, rows: [...], replace?: boolean }
 *        rows: the rollout's JSONL lines (all of them, or only session_meta + message ones)
 *      → { ok, id, title, messages, url }  |  { ok, skipped: "exists", id, url }
 */
const unauthorized = () => Response.json({ error: "Not signed in — run: next-mem0-sync login" }, { status: 401 });

/** Rows can be large; keep this in line with the sync program's chunking of the file. */
const MAX_ROWS = 50_000;

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();
  const imported: Record<string, { id: string; title: string; messages: number }> = {};
  for (const c of await listConversations(user.id)) {
    if (c.source === "codex" && c.cliSessionId) {
      imported[c.cliSessionId] = { id: c.id, title: c.title, messages: c.messageCount };
    }
  }
  return Response.json({ ok: true, user: user.email, imported });
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as
    | { session?: Partial<CodexSessionMeta>; rows?: unknown; replace?: unknown }
    | null;
  const session = body?.session;
  if (!session || typeof session.id !== "string" || !session.id) {
    return Response.json({ error: "session.id is required" }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || !body.rows.length) {
    return Response.json({ error: "rows must be a non-empty array" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS) {
    return Response.json({ error: `Too many rows (max ${MAX_ROWS})` }, { status: 413 });
  }

  const meta: CodexSessionMeta = {
    id: session.id,
    name: typeof session.name === "string" ? session.name : undefined,
    cwd: typeof session.cwd === "string" ? session.cwd : undefined,
    startedAt: typeof session.startedAt === "string" ? session.startedAt : undefined,
    updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : undefined,
  };
  let parsed;
  try {
    parsed = parseCodexRows(body.rows, meta);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  if (!parsed.messages.length) {
    return Response.json({ error: "No user/assistant messages in this session" }, { status: 422 });
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
    source: "codex",
    createdAt: parsed.createdAt,
    updatedAt: meta.updatedAt,
    cliSessionId: parsed.cliSessionId,
  });
  const msgs = await addMessages(user.id, convo.id, parsed.messages);
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
