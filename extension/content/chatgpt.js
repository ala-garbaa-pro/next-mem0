/**
 * ChatGPT extractor. Injected on demand by the popup, then called via globalThis.__mem0Extract().
 *
 * Strategy 1 (preferred): ask chatgpt.com's own backend for the conversation. The response is the
 * same `mapping` tree the official data export uses, so mem0's ChatGPT parser handles it and the
 * markdown is byte-exact.
 * Strategy 2 (fallback): read the rendered messages from the DOM. Code blocks are re-fenced;
 * other formatting is whatever innerText gives us.
 */
(() => {
  if (globalThis.__mem0Extract) return; // already injected in this tab

  const conversationId = () => {
    const m = /\/(c|share)\/([0-9a-f-]{20,})/i.exec(location.pathname);
    return m ? { kind: m[1], id: m[2] } : null;
  };

  async function viaBackend({ kind, id }) {
    const session = await fetch("/api/auth/session", { credentials: "include" }).then((r) => (r.ok ? r.json() : null));
    const token = session?.accessToken;
    if (!token) throw new Error("Not signed in to ChatGPT");
    const path = kind === "share" ? `/backend-api/share/${id}` : `/backend-api/conversation/${id}`;
    const res = await fetch(path, { headers: { authorization: `Bearer ${token}` }, credentials: "include" });
    if (!res.ok) throw new Error(`ChatGPT backend answered ${res.status}`);
    const data = await res.json();
    if (!data || typeof data.mapping !== "object") throw new Error("Unexpected response from ChatGPT backend");
    return data;
  }

  function pageTitle(id) {
    const link = document.querySelector(`nav a[href*="/c/${id}"]`);
    const fromNav = link?.textContent?.trim();
    if (fromNav) return fromNav;
    return document.title.replace(/\s*[|·-]\s*ChatGPT\s*$/i, "").replace(/^ChatGPT\s*[|·-]\s*/i, "").trim();
  }

  /** innerText of a message, with <pre> blocks turned back into ``` fences. */
  function messageText(el) {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:-100000px;top:0;width:800px;visibility:hidden;pointer-events:none";
    const clone = el.cloneNode(true);
    box.append(clone);
    for (const pre of clone.querySelectorAll("pre")) {
      const code = pre.querySelector("code");
      const lang = (code?.className.match(/language-([\w+-]+)/) ?? [])[1] ?? "";
      const text = (code ?? pre).textContent.replace(/\n$/, "");
      const fenced = document.createElement("pre");
      fenced.textContent = "```" + lang + "\n" + text + "\n```";
      pre.replaceWith(fenced);
    }
    document.body.append(box);
    try {
      return box.innerText.replace(/\n{3,}/g, "\n\n").trim();
    } finally {
      box.remove();
    }
  }

  function viaDom(id) {
    const messages = [];
    for (const el of document.querySelectorAll("[data-message-author-role]")) {
      const role = el.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") continue;
      const content = messageText(el);
      if (content) messages.push({ role, content });
    }
    if (!messages.length) throw new Error("No messages found on this page. Is the conversation loaded?");
    return { title: pageTitle(id) || "ChatGPT conversation", source: "chatgpt", messages };
  }

  globalThis.__mem0Extract = async () => {
    const ref = conversationId();
    if (!ref) return { ok: false, error: "This is not a ChatGPT conversation page" };
    let backendError = "";
    try {
      const conversation = await viaBackend(ref);
      return { ok: true, method: "api", title: conversation.title, conversation };
    } catch (err) {
      backendError = err instanceof Error ? err.message : String(err);
    }
    try {
      const conversation = viaDom(ref.id);
      return { ok: true, method: "dom", title: conversation.title, conversation, note: backendError };
    } catch (err) {
      return { ok: false, error: `${err instanceof Error ? err.message : String(err)} (backend: ${backendError})` };
    }
  };
})();
