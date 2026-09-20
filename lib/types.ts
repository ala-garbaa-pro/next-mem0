export const SOURCES = ["claude", "chatgpt", "codex", "gemini", "other"] as const;
export type Source = (typeof SOURCES)[number];

export const ROLES = ["user", "assistant", "system"] as const;
export type Role = (typeof ROLES)[number];

export interface Conversation {
  id: string;
  title: string;
  source: Source;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** Session/thread id of the CLI (claude / codex) so the chat can be resumed. */
  cliSessionId: string;
  messageCount: number;
  preview: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  createdAt: string;
  position: number;
}

export interface SearchHit extends Message {
  /** Cosine distance (0 = identical). */
  distance: number;
  conversation: Conversation | null;
}

export interface NewMessage {
  role: Role;
  content: string;
  createdAt?: string;
}

export interface ImportedConversation {
  title: string;
  source: Source;
  createdAt?: string;
  messages: NewMessage[];
}

export function isSource(v: unknown): v is Source {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}
