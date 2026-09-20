import { revalidatePath } from "next/cache";
import { backupHeader, iterateBackup, restoreBackup, type BackupConversation, type BackupHeader } from "@/lib/db";
import { getRequestUser } from "@/lib/session";

/**
 * Export / import everything the signed-in user has stored.
 *
 * GET  /api/backup[?vectors=0]  → streams a JSON file:
 *      { format, version, exportedAt, embedModel, embedDim, conversations, messages, data: [ ...conversation ] }
 *      Vectors are included by default so a restore needs no re-embedding; `vectors=0` leaves them out.
 * POST /api/backup[?mode=merge|replace]  body: that JSON (raw, or multipart with a `file` field)
 *      merge (default): conversations already present are replaced by the file's copy, others kept
 *      replace:         the user's store is emptied first
 */
export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(request.url);
  const withVectors = url.searchParams.get("vectors") !== "0";
  const header = await backupHeader(user.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        const head = JSON.stringify(header);
        write(head.slice(0, -1) + ',"data":[');
        let first = true;
        for await (const convo of iterateBackup(user.id, withVectors)) {
          write((first ? "\n" : ",\n") + JSON.stringify(convo));
          first = false;
        }
        write("\n]}\n");
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  const stamp = header.exportedAt.slice(0, 19).replace(/[T:]/g, "-");
  return new Response(stream, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="next-mem0-backup-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(request.url);
  const replaceAll = url.searchParams.get("mode") === "replace";

  let text: string;
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return Response.json({ error: "Pick a backup file" }, { status: 400 });
    text = await file.text();
  } else {
    text = await request.text();
  }

  let parsed: (Partial<BackupHeader> & { data?: unknown }) | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "The file is not valid JSON" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.data)) {
    return Response.json({ error: "Not a next-mem0 backup file" }, { status: 400 });
  }

  try {
    const result = await restoreBackup(user.id, parsed, parsed.data as BackupConversation[], { replaceAll });
    revalidatePath("/", "layout");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
