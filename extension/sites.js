/**
 * Registry of supported chat sites. Adding a site = one entry here + one extractor in content/.
 * `match` must return a stable key for the conversation (used to remember what was imported)
 * or null when the URL is not a conversation page.
 */
export const SITES = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    source: "chatgpt",
    script: "content/chatgpt.js",
    match(url) {
      const u = new URL(url);
      if (!/^(chatgpt\.com|chat\.openai\.com)$/.test(u.hostname)) return null;
      const m = /\/c\/([0-9a-f-]{20,})/i.exec(u.pathname) ?? /\/share\/([0-9a-f-]{20,})/i.exec(u.pathname);
      return m ? `chatgpt:${m[1]}` : null;
    },
  },
  // { id: "claude",  label: "Claude",  source: "claude",  script: "content/claude.js",  match(url) { ... } },
  // { id: "gemini",  label: "Gemini",  source: "gemini",  script: "content/gemini.js",  match(url) { ... } },
];

export function detectSite(url) {
  if (!url) return null;
  for (const site of SITES) {
    let key = null;
    try {
      key = site.match(url);
    } catch {
      /* not a URL */
    }
    if (key) return { site, key };
  }
  return null;
}

export const DEFAULT_MEM0_URL = "http://localhost:3000";

export async function getSettings() {
  const { mem0Url } = await chrome.storage.sync.get({ mem0Url: DEFAULT_MEM0_URL });
  return { mem0Url: String(mem0Url).replace(/\/+$/, "") || DEFAULT_MEM0_URL };
}
