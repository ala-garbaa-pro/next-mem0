/** CLI providers the chat panel can talk to. Kept dependency-free so client components can import it. */
export const PROVIDERS = ["claude", "codex"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const isProvider = (v: unknown): v is Provider =>
  typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);
