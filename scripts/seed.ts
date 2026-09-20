/**
 * Seed the database from a JSON file (see lib/seed.ts for the two accepted shapes).
 *
 *   bun run db:seed <file.json> [--user <email>] [--password <pw>] [--replace]
 *
 * --user      account that owns the data (default: the file's `user.email`)
 * --password  create the account when it does not exist (default: the file's `user.password`)
 * --replace   empty that account's conversations first
 *
 * Needs Postgres (DATABASE_URL) and, unless the file carries vectors, Ollama for embeddings.
 */
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    user: { type: "string" },
    password: { type: "string" },
    replace: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const file = positionals[0];
if (values.help || !file) {
  console.log("Usage: bun run db:seed <file.json> [--user <email>] [--password <pw>] [--replace]");
  process.exit(values.help ? 0 : 1);
}

const { seedFromFile } = await import("../lib/seed");
const { closeDb } = await import("../lib/drizzle");

try {
  const results = await seedFromFile(file, { email: values.user, password: values.password, replace: values.replace });
  for (const r of results) {
    if (r.conversations === 0 && r.messages === 0 && r.skipped === 0) {
      console.log(`${r.email}: ${r.createdUser ? "account created" : "account already exists"}`);
      continue;
    }
    console.log(
      `Seeded ${r.conversations} conversation(s), ${r.messages} message(s) for ${r.email}` +
        (r.createdUser ? " (account created)" : "") +
        (r.reembedded ? `; embedded ${r.reembedded}` : "") +
        (r.skipped ? `; skipped ${r.skipped} invalid` : ""),
    );
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
