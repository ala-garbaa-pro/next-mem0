/**
 * Gemini extractor. Injected on demand by the popup, then called via globalThis.__mem0Extract().
 *
 * DOM only, unlike the ChatGPT and Claude extractors. gemini.google.com has no readable JSON
 * endpoint for a conversation — the page talks to a batchexecute RPC whose payload is positional
 * arrays with no field names — so reading the rendered turns is both simpler and steadier than
 * decoding that. Code blocks are re-fenced; other formatting is whatever innerText gives us.
 *
 * Only the turns already rendered are captured: Gemini virtualises a long conversation, so scroll
 * to the top before importing one that has been going for a while.
 */
(() => {
  if (globalThis.__mem0Extract) return; // already injected in this tab

  // /app/<id>, also under an account prefix such as /u/1/app/<id>, and a shared /share/<id>.
  const conversationId = () => {
    const m = /\/(?:app|share)\/([0-9a-z_-]{8,})/i.exec(location.pathname);
    return m ? m[1] : null;
  };

  function pageTitle() {
    const selected = document.querySelector('[data-test-id="conversation"][aria-selected="true"], .conversation.selected');
    const fromList = selected?.textContent?.trim();
    if (fromList) return fromList;
    return document.title.replace(/\s*[|·-]\s*Gemini\s*$/i, "").replace(/^Gemini\s*[|·-]\s*/i, "").trim();
  }

  /** innerText of a turn, with <pre>/code blocks turned back into ``` fences. */
  function messageText(el) {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:-100000px;top:0;width:800px;visibility:hidden;pointer-events:none";
    const clone = el.cloneNode(true);
    box.append(clone);
    // Gemini wraps a snippet in <code-block>, whose header repeats the language and holds the
    // copy/run buttons; keep the code and drop the chrome around it.
    for (const block of clone.querySelectorAll("code-block, pre")) {
      const code = block.querySelector("code");
      const lang = (code?.className.match(/language-([\w+-]+)/) ?? [])[1] ?? "";
      const text = (code ?? block).textContent.replace(/\n$/, "");
      const fenced = document.createElement("pre");
      fenced.textContent = "```" + lang + "\n" + text + "\n```";
      block.replaceWith(fenced);
    }
    for (const junk of clone.querySelectorAll("button, .code-block-decoration, .buttons-container-v2, mat-icon")) {
      junk.remove();
    }
    document.body.append(box);
    try {
      return box.innerText.replace(/\n{3,}/g, "\n\n").trim();
    } finally {
      box.remove();
    }
  }

  /**
   * Gemini's Angular components: <user-query> for what you asked, <model-response> for the answer.
   * The class names inside them churn between releases, so the turn elements are matched by tag
   * and the text is taken from the whole turn rather than from a particular inner class.
   */
  const TURNS = "user-query, model-response";

  function viaDom() {
    const messages = [];
    const taken = [];
    for (const el of document.querySelectorAll(TURNS)) {
      if (taken.some((prev) => prev.contains(el))) continue;
      taken.push(el);
      const role = el.tagName.toLowerCase() === "user-query" ? "user" : "assistant";
      const content = messageText(el);
      if (content) messages.push({ role, content });
    }
    if (!messages.length) {
      throw new Error("No messages found on this page. Is the conversation open and loaded?");
    }
    return { title: pageTitle() || "Gemini conversation", source: "gemini", messages };
  }

  globalThis.__mem0Extract = async () => {
    if (!conversationId()) return { ok: false, error: "This is not a Gemini conversation page" };
    try {
      const conversation = viaDom();
      return {
        ok: true,
        method: "dom",
        title: conversation.title,
        conversation,
        note: "Read from the page — scroll to the top first if the conversation is long.",
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
})();
