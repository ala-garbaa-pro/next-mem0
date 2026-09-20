# mem0 browser extension

Imports the conversation open in the current tab into your local mem0 with one click.
No build step — plain Manifest V3 JavaScript.

## Install (Chrome / Edge / Brave)

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → pick this `extension/` folder.
3. Start mem0 (`npx next-mem0`, or `bun dev` from the repo). If it is not on `http://localhost:3000`, click the ⚙ in the popup and set the URL.

## Use

Open a conversation (e.g. `https://chatgpt.com/c/<id>`), click the mem0 icon, **Import into mem0**.
The popup remembers what it imported: it shows **Open in mem0** and turns the button into
**Re-import (replace)**, which deletes the old copy and saves the current state of the chat.

## How it works

```
popup.js  ──executeScript──▶  content/<site>.js   (reads the conversation in the tab)
   │
   └──message──▶ background.js ──POST /api/import──▶ mem0 (Next.js route, app/api/import/route.ts)
```

- **ChatGPT** (`content/chatgpt.js`): asks chatgpt.com's own backend for the conversation, which is
  the same `mapping` tree the official data export uses, so mem0 reuses its export parser and the
  markdown is exact. If that fails (signed out, API change) it reads the rendered page instead and
  re-fences code blocks.
- The POST happens in the service worker so it finishes even if you close the popup while mem0
  is embedding the messages.
- `/api/import` deliberately sends no CORS headers: the extension has host permission for
  localhost, so it can call it, but a random web page cannot write into your store.

## Adding a site (Claude, Gemini, …)

1. Add an entry to `SITES` in `sites.js`: `id`, `label`, `source` (one of mem0's sources), `script`,
   and a `match(url)` that returns a stable key like `claude:<id>` or `null`.
2. Write `content/<site>.js` that sets `globalThis.__mem0Extract = async () => ({ ok, conversation, method })`.
   `conversation` is anything `lib/importers.ts` understands — the site's native export shape or the
   generic `{ title, source, messages: [{ role, content }] }`.
