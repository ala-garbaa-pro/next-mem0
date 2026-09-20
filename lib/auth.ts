/**
 * Better Auth server instance. Email + password only; sessions and users live in Postgres via the
 * Drizzle adapter (tables in lib/schema.ts). Set BETTER_AUTH_SECRET in production — the npx
 * launcher generates one into ~/.next-mem0/auth-secret.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./drizzle";
import * as schema from "./schema";

/**
 * The app runs on whatever port / hostname `next-mem0 -p -H` was given, so unless BETTER_AUTH_URL
 * pins one origin, derive it per request and accept any loopback host (plus NEXT_MEM0_ALLOWED_HOSTS,
 * comma-separated, e.g. "192.168.1.*:*,mem0.lan:3000" when serving the LAN).
 */
const extraHosts = (process.env.NEXT_MEM0_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
const baseURL = process.env.BETTER_AUTH_URL ?? {
  allowedHosts: ["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*", "[::1]", "[::1]:*", ...extraHosts],
  // Direct auth.api calls with no request (scripts/seed.ts) have no host to derive from.
  fallback: `http://localhost:${process.env.PORT ?? 3000}`,
};

/** Sign-up is off unless NEXT_MEM0_ALLOW_SIGNUP=1 — create accounts with `bun run db:seed:users` instead. */
export const ALLOW_SIGNUP = process.env.NEXT_MEM0_ALLOW_SIGNUP === "1";

export const auth = betterAuth({
  baseURL,
  // `next build` imports this module with no environment; the placeholder only exists in that phase.
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (process.env.NEXT_PHASE === "phase-production-build" ? "build-time-placeholder-never-used" : undefined),
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    disableSignUp: !ALLOW_SIGNUP,
  },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Must be last so server actions can set cookies.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
