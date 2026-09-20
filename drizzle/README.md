Drizzle migrations, applied automatically by `lib/drizzle.ts` on first database use.

After changing `lib/schema.ts`:

    bun run db:generate --name <what-changed>

`0000_init.sql` starts with `CREATE EXTENSION IF NOT EXISTS vector;` (added by hand — drizzle-kit
does not emit it). Keep that line if you ever regenerate from scratch.
