# next-mem0 browser extension

Imports the conversation open in the current tab into your local next-mem0 with one click.
No build step — plain Manifest V3 JavaScript.

## Install (Chrome / Edge / Brave)

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → pick this `extension/` folder.
3. Start next-mem0 (`npx next-mem0`, or `bun dev` from the repo). If it is not on `http://localhost:3000`, click the gear in the popup and set the URL.
4. Open next-mem0 in this browser and **sign in** — the extension reuses that session cookie, so a
   signed-out browser gets "Not signed in" from the popup.

## Use

Open a conversation (e.g. `https://chatgpt.com/c/<id>` or `https://claude.ai/chat/<id>`), click the next-mem0 icon, **Import into next-mem0**.
The popup remembers what it imported: it shows **Open in next-mem0** and turns the button into
**Re-import (replace)**, which deletes the old copy and saves the current state of the chat.

The popup uses the same look as the app (dark by default); the sun/moon button in the header
switches between dark and light, and the choice is synced with your Chrome profile.

## How it works

```
popup.js  ──executeScript──▶  content/<site>.js   (reads the conversation in the tab)
   │
   └──message──▶ background.js ──POST /api/import──▶ next-mem0 (route: app/api/import/route.ts)
```

- **ChatGPT** (`content/chatgpt.js`): asks chatgpt.com's own backend for the conversation, which is
  the same `mapping` tree the official data export uses, so next-mem0 reuses its export parser and
  the markdown is exact. If that fails (signed out, API change) it reads the rendered page instead
  and re-fences code blocks.
- **Claude** (`content/claude.js`): the same two strategies against claude.ai — its backend returns
  the `chat_messages` array the official export uses. Works on `/chat/<id>` and on a shared
  `/share/<id>` snapshot.
- **Gemini** (`content/gemini.js`): DOM only. gemini.google.com has no readable JSON endpoint for a
  conversation — the page talks to a batchexecute RPC of positional arrays with no field names — so
  the rendered `<user-query>` / `<model-response>` turns are read instead. Gemini virtualises long
  conversations, so scroll to the top before importing one.
- The POST happens in the service worker so it finishes even if you close the popup while
  next-mem0 is embedding the messages.
- `/api/import` requires the Better Auth session cookie (the fetch runs with `credentials: "include"`)
  and deliberately sends no CORS headers: the extension has host permission for localhost, so it
  can call it, but a random web page cannot write into your store.

## Adding a site

1. Add an entry to `SITES` in `sites.js`: `id`, `label`, `source` (one of next-mem0's sources), `script`,
   and a `match(url)` that returns a stable key like `claude:<id>` or `null`.
2. Write `content/<site>.js` that sets `globalThis.__mem0Extract = async () => ({ ok, conversation, method })`.
   `conversation` is anything `lib/importers.ts` understands — the site's native export shape or the
   generic `{ title, source, messages: [{ role, content }] }`.
