/**
 * One-off migration from a next-mem0 0.1.x LanceDB directory to a backup file that the Backup page
 * (or `POST /api/backup`) imports into Postgres. Vectors are carried over, so nothing is re-embedded
 * as long as the same embedding model is configured.
 *
 *   bun install --no-save @lancedb/lancedb apache-arrow     # not a dependency any more
 *   bun scripts/lancedb-to-backup.ts [lancedb dir] [out.json]
 *
 * Defaults: ./data/lancedb (or $MEM0_DB_PATH, or ~/.next-mem0/lancedb) → ./next-mem0-backup.json
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const candidates = [
  process.argv[2],
  process.env.MEM0_DB_PATH,
  path.join(process.cwd(), "data", "lancedb"),
  path.join(os.homedir(), ".next-mem0", "lancedb"),
].filter((p): p is string => Boolean(p));
const dir = candidates.find((p) => fs.existsSync(path.join(p, "conversations.lance")));
if (!dir) {
  console.error(`No LanceDB store found. Looked in:\n  ${candidates.join("\n  ")}`);
  process.exit(1);
}
const out = process.argv[3] ?? path.join(process.cwd(), "next-mem0-backup.json");

let lancedb: typeof import("@lancedb/lancedb");
try {
  lancedb = await import("@lancedb/lancedb");
} catch {
  console.error("@lancedb/lancedb is not installed. Run:  bun install --no-save @lancedb/lancedb apache-arrow");
  process.exit(1);
}

type ConvoRow = {
  id: string;
  title: string;
  source: string;
  tags: string;
  created_at: string;
  updated_at: string;
  cli_session_id: string;
};
type MsgRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  position: number;
  vector: ArrayLike<number>;
};

const db = await lancedb.connect(dir, { readConsistencyInterval: 0 });
const convos = (await (await db.openTable("conversations")).query().limit(1_000_000).toArray()) as ConvoRow[];
const msgs = (await (await db.openTable("messages")).query().limit(10_000_000).toArray()) as MsgRow[];

const byConvo = new Map<string, MsgRow[]>();
for (const m of msgs) (byConvo.get(m.conversation_id) ?? byConvo.set(m.conversation_id, []).get(m.conversation_id)!).push(m);

const dim = msgs[0] ? msgs[0].vector.length : Number(process.env.EMBED_DIM ?? 768);
const data = convos
  .sort((a, b) => a.created_at.localeCompare(b.created_at))
  .map((c) => {
    let tags: string[] = [];
    try {
      tags = JSON.parse(c.tags || "[]");
    } catch {
      /* ignore bad json */
    }
    return {
      id: c.id,
      title: c.title,
      source: c.source,
      tags,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      cliSessionId: c.cli_session_id ?? "",
      messages: (byConvo.get(c.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          position: Number(m.position),
          embedding: Array.from(m.vector, (v) => Number(v.toFixed(6))),
        })),
    };
  });

const backup = {
  format: "next-mem0-backup",
  version: 1,
  exportedAt: new Date().toISOString(),
  embedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  embedDim: dim,
  conversations: data.length,
  messages: msgs.length,
  data,
};
fs.writeFileSync(out, JSON.stringify(backup));
console.log(`Wrote ${data.length} conversations / ${msgs.length} messages from ${dir}\n  → ${out}`);
console.log("Import it from the Backup page of the running app (or POST it to /api/backup).");
