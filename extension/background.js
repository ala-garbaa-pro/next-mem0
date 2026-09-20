import { getSettings } from "./sites.js";

/**
 * Talks to the mem0 server. Runs here rather than in the popup so an import completes even if the
 * popup is closed while messages are being embedded.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = msg?.type === "IMPORT" ? importConversation : msg?.type === "PING" ? ping : null;
  if (!handler) return false;
  handler(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true; // keep the channel open for the async response
});

async function mem0Fetch(path, init) {
  const { mem0Url } = await getSettings();
  let res;
  try {
    res = await fetch(mem0Url + path, init);
  } catch {
    throw new Error(`Cannot reach mem0 at ${mem0Url}. Is \`bun dev\` running?`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `mem0 answered ${res.status}`);
  return body;
}

async function ping() {
  const body = await mem0Fetch("/api/import");
  return { ok: true, ...body };
}

async function importConversation({ key, source, conversation, replaceId, pageUrl }) {
  const body = await mem0Fetch("/api/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversation, source, replaceId }),
  });
  const record = {
    id: body.id,
    title: body.title,
    messages: body.messages,
    url: body.url,
    pageUrl,
    importedAt: new Date().toISOString(),
  };
  const { imports = {} } = await chrome.storage.local.get("imports");
  imports[key] = record;
  await chrome.storage.local.set({ imports });
  return { ok: true, ...record };
}
