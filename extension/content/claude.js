/**
 * Claude.ai extractor. Injected on demand by the popup, then called via globalThis.__mem0Extract().
 *
 * Strategy 1 (preferred): ask claude.ai's own backend for the conversation. The response carries a
 * `chat_messages` array — the same shape the official data export uses — so next-mem0's Claude
 * parser handles it and the markdown is byte-exact.
 * Strategy 2 (fallback): read the rendered messages from the DOM. Code blocks are re-fenced; other
 * formatting is whatever innerText gives us.
 */
(() => {
  if (globalThis.__mem0Extract) return; // already injected in this tab

  const conversationId = () => {
    const m = /\/(chat|share)\/([0-9a-f-]{20,})/i.exec(location.pathname);
    return m ? { kind: m[1], id: m[2] } : null;
  };

  const json = async (path) => {
    const res = await fetch(path, { credentials: "include", headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`claude.ai answered ${res.status} for ${path}`);
    return res.json();
  };

  /** The account's organization — every conversation lives under one. */
  async function organizationId() {
    const orgs = await json("/api/organizations");
    const uuid = Array.isArray(orgs) ? orgs.find((o) => o?.uuid)?.uuid : null;
    if (!uuid) throw new Error("Not signed in to Claude");
    return uuid;
  }

  async function viaBackend({ kind, id }) {
    // A shared snapshot is public and lives outside the organization.
    if (kind === "share") return json(`/api/chat_snapshots/${id}`);
    const org = await organizationId();
    return json(`/api/organizations/${org}/chat_conversations/${id}?tree=True&rendering_mode=messages`);
  }

  function pageTitle() {
    return document.title
      .replace(/\s*[|·-]\s*Claude\s*$/i, "")
      .replace(/^Claude\s*[|·-]\s*/i, "")
      .trim();
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

  /**
   * Claude.ai marks the user's turns with a testid and renders Claude's own turns in the
   * `font-claude-*` wrapper; the class name has changed across redesigns, so several are tried.
   * Matches are walked in document order, and anything nested inside an earlier hit is skipped.
   */
  const TURNS = '[data-testid="user-message"], .font-claude-response, .font-claude-message';

  function viaDom() {
    const messages = [];
    const taken = [];
    for (const el of document.querySelectorAll(TURNS)) {
      if (taken.some((prev) => prev.contains(el))) continue;
      taken.push(el);
      const role = el.matches('[data-testid="user-message"]') ? "user" : "assistant";
      const content = messageText(el);
      if (content) messages.push({ role, content });
    }
    if (!messages.length) throw new Error("No messages found on this page. Is the conversation loaded?");
    return { title: pageTitle() || "Claude conversation", source: "claude", messages };
  }

  globalThis.__mem0Extract = async () => {
    const ref = conversationId();
    if (!ref) return { ok: false, error: "This is not a Claude conversation page" };
    let backendError = "";
    try {
      const conversation = await viaBackend(ref);
      if (!conversation || !Array.isArray(conversation.chat_messages)) {
        throw new Error("Unexpected response from the Claude backend");
      }
      return { ok: true, method: "api", title: conversation.name, conversation };
    } catch (err) {
      backendError = err instanceof Error ? err.message : String(err);
    }
    try {
      const conversation = viaDom();
      return { ok: true, method: "dom", title: conversation.title, conversation, note: backendError };
    } catch (err) {
      return { ok: false, error: `${err instanceof Error ? err.message : String(err)} (backend: ${backendError})` };
    }
  };
})();
