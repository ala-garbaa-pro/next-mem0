"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addMessages,
  createConversation,
  deleteConversation as dbDeleteConversation,
  updateConversation,
} from "@/lib/db";
import { parseExport, parseTranscript } from "@/lib/importers";
import { requireUser } from "@/lib/session";
import { isRole, isSource, type Source } from "@/lib/types";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const fail = (err: unknown): ActionResult => ({
  ok: false,
  error: err instanceof Error ? err.message : String(err),
});

function parseTags(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function sourceOf(raw: FormDataEntryValue | null): Source {
  return isSource(raw) ? raw : "other";
}

/** Create a conversation, optionally seeded from a pasted transcript, then open it. */
export async function createConversationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let id: string;
  try {
    const convo = await createConversation(user.id, {
      title: String(formData.get("title") ?? ""),
      source: sourceOf(formData.get("source")),
      tags: parseTags(formData.get("tags")),
    });
    id = convo.id;
    const transcript = String(formData.get("transcript") ?? "");
    if (transcript.trim()) {
      await addMessages(user.id, id, parseTranscript(transcript));
    }
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  redirect(`/c/${id}`);
}

export async function addMessageAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const role = formData.get("role");
  const content = String(formData.get("content") ?? "");
  if (!conversationId || !isRole(role)) return { ok: false, error: "Invalid message" };
  if (!content.trim()) return { ok: false, error: "Message is empty" };
  const user = await requireUser();
  try {
    await addMessages(user.id, conversationId, [{ role, content }]);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function renameConversationAction(id: string, title: string, tags: string[]): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await updateConversation(user.id, id, { title, tags });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteConversationAction(id: string): Promise<void> {
  const user = await requireUser();
  await dbDeleteConversation(user.id, id);
  revalidatePath("/", "layout");
  redirect("/");
}

export interface ImportResult extends Record<string, unknown> {
  ok: boolean;
  error?: string;
  imported?: { id: string; title: string; messages: number }[];
  skipped?: number;
}

/** Import one or more export files (ChatGPT / Claude / generic JSON). */
export async function importFilesAction(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "Pick at least one JSON file" };
  const fallback = sourceOf(formData.get("source"));
  const user = await requireUser();

  const imported: NonNullable<ImportResult["imported"]> = [];
  let skipped = 0;
  try {
    for (const file of files) {
      const parsed = parseExport(await file.text(), fallback);
      for (const c of parsed) {
        if (!c.messages.length) {
          skipped++;
          continue;
        }
        const convo = await createConversation(user.id, { title: c.title, source: c.source, createdAt: c.createdAt });
        const msgs = await addMessages(user.id, convo.id, c.messages);
        imported.push({ id: convo.id, title: convo.title, messages: msgs.length });
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), imported, skipped };
  }
  revalidatePath("/", "layout");
  return { ok: true, imported, skipped };
}
