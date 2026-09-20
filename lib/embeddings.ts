/**
 * Embeddings via a local Ollama server (default model: nomic-embed-text, 768 dims).
 * Nothing leaves the machine.
 */
const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
export const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
export const EMBED_DIM = Number(process.env.EMBED_DIM ?? 768);

const BATCH = 32;
// nomic-embed-text handles ~8k tokens; keep well under that.
const MAX_CHARS = 8000;

async function embedRaw(inputs: string[]): Promise<number[][]> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs, truncate: true }),
    });
  } catch {
    throw new Error(
      `Cannot reach Ollama at ${OLLAMA_URL}. Start it (ollama serve) and run: ollama pull ${EMBED_MODEL}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Ollama embed failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { embeddings: number[][] };
  return json.embeddings;
}

async function embedBatched(inputs: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    out.push(...(await embedRaw(inputs.slice(i, i + BATCH))));
  }
  return out;
}

function clean(text: string): string {
  const t = text.trim().slice(0, MAX_CHARS);
  return t.length ? t : "(empty)";
}

/** Embed stored messages. nomic-embed-text expects a task prefix. */
export function embedDocuments(texts: string[]): Promise<number[][]> {
  if (!texts.length) return Promise.resolve([]);
  return embedBatched(texts.map((t) => `search_document: ${clean(t)}`));
}

export async function embedQuery(query: string): Promise<number[]> {
  const [v] = await embedRaw([`search_query: ${clean(query)}`]);
  return v;
}

export async function ollamaStatus(): Promise<{ ok: boolean; model: string; url: string; error?: string }> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { cache: "no-store" });
    if (!res.ok) return { ok: false, model: EMBED_MODEL, url: OLLAMA_URL, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { models: { name: string }[] };
    const has = json.models.some((m) => m.name === EMBED_MODEL || m.name === `${EMBED_MODEL}:latest`);
    return has
      ? { ok: true, model: EMBED_MODEL, url: OLLAMA_URL }
      : { ok: false, model: EMBED_MODEL, url: OLLAMA_URL, error: `model not pulled: ollama pull ${EMBED_MODEL}` };
  } catch {
    return { ok: false, model: EMBED_MODEL, url: OLLAMA_URL, error: "not running" };
  }
}
