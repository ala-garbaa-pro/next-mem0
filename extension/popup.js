import { DEFAULT_MEM0_URL, SITES, detectSite, getSettings } from "./sites.js";

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

let tab = null;
let detected = null; // { site, key }
let previous = null; // record from chrome.storage.local.imports[key]

// ---------- theme (dark by default, same as the app; `.dark` on <html>) ----------

function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

async function initTheme() {
  const { theme } = await chrome.storage.sync.get({ theme: "dark" });
  applyTheme(theme);
  // The popup opens with `no-transition` so the stored theme lands without a flash.
  requestAnimationFrame(() => document.documentElement.classList.remove("no-transition"));
}

$("toggle-theme").addEventListener("click", async () => {
  const theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyTheme(theme);
  await chrome.storage.sync.set({ theme });
});

async function init() {
  await initTheme();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  detected = detectSite(tab?.url);

  const { mem0Url } = await getSettings();
  $("mem0-url").value = mem0Url;

  if (!detected) {
    $("status").textContent = "Open a conversation to import it.";
    $("hint").textContent = `Supported: ${SITES.map((s) => s.label).join(", ")}. Claude and Gemini are next.`;
    $("hint").hidden = false;
    return;
  }

  const { imports = {} } = await chrome.storage.local.get("imports");
  previous = imports[detected.key] ?? null;

  $("status").hidden = true;
  $("card").hidden = false;
  $("site-badge").textContent = detected.site.label;
  $("site-badge").dataset.source = detected.site.source;
  $("page-title").textContent = tab.title?.replace(/\s*[|·-]\s*ChatGPT\s*$/i, "") || "Conversation";
  renderPrevious();
}

function renderPrevious() {
  const prev = $("prev");
  const open = $("open");
  if (previous) {
    const when = new Date(previous.importedAt).toLocaleString();
    prev.textContent = `Imported ${when} · ${previous.messages} messages`;
    prev.hidden = false;
    open.href = previous.url;
    open.hidden = false;
    $("import-label").textContent = "Re-import (replace)";
  } else {
    prev.hidden = true;
    open.hidden = true;
    $("import-label").textContent = "Import into next-mem0";
  }
}

function showResult(text, kind) {
  const el = $("result");
  el.textContent = text;
  el.className = `result ${kind}`;
  el.hidden = false;
}

async function extract() {
  // Inject the extractor (idempotent) then call it. Both run in the same isolated world.
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [detected.site.script] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.__mem0Extract(),
  });
  if (!result) throw new Error("Extractor returned nothing");
  if (!result.ok) throw new Error(result.error);
  return result;
}

$("import").addEventListener("click", async () => {
  const btn = $("import");
  btn.disabled = true;
  try {
    showResult("Reading conversation…", "");
    const extracted = await extract();
    const n = Array.isArray(extracted.conversation.messages)
      ? extracted.conversation.messages.length
      : Object.keys(extracted.conversation.mapping ?? {}).length;
    showResult(`Saving to next-mem0 (${n} messages, embedding locally)…`, "");
    const res = await send({
      type: "IMPORT",
      key: detected.key,
      source: detected.site.source,
      conversation: extracted.conversation,
      replaceId: previous?.id,
      pageUrl: tab.url,
    });
    if (!res?.ok) throw new Error(res?.error ?? "Import failed");
    previous = res;
    renderPrevious();
    const via = extracted.method === "dom" ? " (read from the page; formatting may be simplified)" : "";
    showResult(`Saved “${res.title}” — ${res.messages} messages${via}.`, "ok");
  } catch (err) {
    showResult(err instanceof Error ? err.message : String(err), "err");
  } finally {
    btn.disabled = false;
  }
});

// ---------- settings ----------

$("toggle-settings").addEventListener("click", () => {
  $("settings").hidden = !$("settings").hidden;
});

$("save").addEventListener("click", async () => {
  const out = $("settings-result");
  let url;
  try {
    url = new URL($("mem0-url").value.trim() || DEFAULT_MEM0_URL);
  } catch {
    out.textContent = "That is not a valid URL.";
    return;
  }
  const origin = `${url.origin}/*`;
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (!isLocal) {
    // Non-local servers need an explicit host permission (must happen inside this click).
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      out.textContent = "Permission for that host was not granted.";
      return;
    }
  }
  await chrome.storage.sync.set({ mem0Url: url.origin });
  out.textContent = "Checking connection…";
  const res = await send({ type: "PING" });
  out.textContent = res?.ok
    ? `Connected — ${res.conversations} conversations, ${res.messages} messages.`
    : res?.error ?? "Could not connect.";
});

init().catch((err) => {
  $("status").textContent = err instanceof Error ? err.message : String(err);
});
