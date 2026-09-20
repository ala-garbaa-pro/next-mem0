# mem0 — design prompts

Prompts for generating the visual design of each screen (e.g. with Claude Design).
Every prompt is self-contained: paste **the shared context block** first, then the prompt for the page you want.

---

## 0. Shared context (paste this before every page prompt)

```
You are designing screens for "mem0", a local-first desktop web app that stores a person's AI
conversation history (from Claude, ChatGPT, Codex, Gemini) on their own machine and lets them
search it by meaning. Everything runs locally: an embedded vector database (LanceDB) and a local
embedding model (Ollama, nomic-embed-text). The app also lets the user continue a conversation
by chatting with the locally installed `claude` or `codex` command-line tools.

Audience: a single developer / power user. Tone: calm, precise, trustworthy, "your data stays here".
Not a SaaS landing page — it is a tool, used daily, mostly on a laptop or wide desktop screen.

DESIGN SYSTEM (must follow)
- Component library: shadcn/ui (base-nova style, Base UI primitives), Tailwind CSS v4.
- Theme: "sky". Primary = oklch(0.5 0.134 242.749) (a deep sky blue), primary foreground near-white.
  Neutral greys for backgrounds/borders. Light and dark mode are both required.
  Light: background white, foreground oklch(0.145 0 0), muted oklch(0.97 0 0), border oklch(0.922 0 0).
  Dark: background oklch(0.145 0 0), card oklch(0.205 0 0), borders white at 10% opacity.
  Sidebar has its own slightly-off-background surface (oklch(0.985 0 0) light / oklch(0.205 0 0) dark).
- Chart / accent ramp (sky): oklch(0.828 0.111 230), oklch(0.685 0.169 237), oklch(0.588 0.158 242),
  oklch(0.5 0.134 243), oklch(0.443 0.11 241).
- Radius: base 0.625rem (10px); cards 12–14px; buttons 8–10px; pills fully rounded.
- Typography: body = Roboto; headings = Noto Sans (semibold, tight tracking); code/ids = Geist Mono.
  Body text 14px, secondary/meta 12px, page title 20–24px. Dense but breathable.
- Icons: Lucide, 16px, 1.5px stroke.
- Source badges (small rounded pills, tinted background at ~15% + saturated text):
  Claude = orange, ChatGPT = emerald, Codex = violet, Gemini = sky, Other = neutral grey.
- Message roles: user = subtle primary-tinted surface (primary at 8% light / 15% dark) with a solid
  primary avatar square; assistant = card surface with 1px hairline ring; system = muted grey text.
- Buttons: default (solid primary), outline, ghost, destructive (red tint bg + red text, not solid red).
- Toasts: bottom-right, small, sonner-style.

APP SHELL (present on every screen)
- Left sidebar, fixed, 288px wide, full height, hairline right border.
  Top: 32px rounded-square logo (brain icon on primary), app name "mem0" (heading font) with
  subtitle "local AI memory" in muted 12px, and a sun/moon theme toggle icon button on the right.
  Below: three equal outline buttons in one row: "+ New", "↑ Import", "🔍 Search".
  Divider. Section label "Conversations" with a count on the right (muted 12px).
  A small filter input "Filter by title or tag…".
  Scrollable list of conversation rows: title (14px, single line, truncated), second line with a
  tiny source pill, "N msgs", and the date right-aligned (muted 12px). Active row has a filled
  sidebar-accent background; hover a lighter version. Empty list says "Nothing stored yet." /
  "No matches." centered in muted text.
  Footer pinned to bottom: database icon + "LanceDB · ./data/lancedb" in muted 12px.
  Error state: a red-tinted bordered card "Database error" with the message.
- Main content area to the right: page content centered in a max-width column
  (~896px for Home/Search, ~768px for Conversation/New/Import), 40px vertical padding, 24px side padding.

Deliver: high-fidelity mockups at 1440×900 (desktop) in BOTH light and dark mode, plus the states listed.
Use realistic developer-flavoured sample content (CSS questions, Postgres indexes, Rust borrow checker,
Docker networking, sourdough baking) — never lorem ipsum.
```

---

## 1. Home / dashboard (`/`)

```
Design the HOME screen of mem0.

Purpose: a calm landing view that shows the state of the local memory, lets the user search
immediately, and jumps into recent conversations.

Layout (main column, max ~896px):
1. Hero block (no illustration, text only):
   - H1 (Noto Sans semibold, 24px): "Your AI memory, on your disk"
   - One muted sentence (14px): "Every conversation is embedded with `nomic-embed-text` and stored in
     LanceDB under `./data/lancedb`. Search by meaning, not just keywords." — the two code spans are
     inline chips in Geist Mono on a muted background.
   - Large search row directly beneath: a 36px-tall search input with a magnifier icon at the left and
     placeholder "Search everything you have discussed… e.g. “that regex for parsing dates”", plus a
     solid primary "Search" button on the right. This input is focused by default.
2. Three stat cards in a row (small cards, 12px radius, hairline ring):
   - "Conversations" → big number (e.g. 42)
   - "Messages (vectors)" → big number (e.g. 1,318)
   - "Embeddings · Ollama" → a 8px status dot + text: green dot "ready" (normal),
     red dot with "not running" or "model not pulled: ollama pull nomic-embed-text" (error state).
3. "Recent" section: small section heading on the left; on the right two small outline buttons
   "+ New" and "↑ Import".
   Grid of conversation cards, 2 columns, small size:
   - top row: source pill (e.g. Claude / ChatGPT / Codex) left, timestamp "9/20/2026, 10:55 AM" right (muted 12px)
   - title (heading font, 14px, 1 line clamp)
   - preview of the first message (muted, 2-line clamp)
   Whole card is a link; hover = slightly tinted background.

States to show:
- Populated (8 cards, mixed sources).
- Empty: instead of the grid, a single card with a centered muted chat icon, the sentence
  "Nothing stored yet. Paste a transcript, import a ChatGPT / Claude export, or start a chat with the
  Claude or Codex CLI." and a solid primary button "Create your first conversation →".
- Ollama offline (red status card) while the rest still renders.
Light and dark mode.
```

---

## 2. Conversation view (`/c/[id]`)

```
Design the CONVERSATION screen of mem0 — the most used screen.

Purpose: read one stored conversation, add to it by hand, or continue it by chatting with the local
Claude Code or Codex CLI (every turn is saved automatically).

Layout (main column, max ~768px):
1. Header:
   - H1 title (Noto Sans semibold, 20px), e.g. "how do I center a div horizontally and vertically?"
   - Right of the title, two ghost icon buttons: pencil (Edit) and trash (Delete).
   - Meta row under the title (muted 12px, dot-separated): source pill · "10 messages" ·
     "created 9/20/2026, 10:53 AM" · optionally "session 7055234f…" in Geist Mono when a CLI session exists.
   - Optional row of small outline tag pills: "css", "layout".
2. Message list (vertical stack, 12px gaps). Each message is a rounded 12px block:
   - Left: 24px rounded-square avatar — solid primary with a user icon for the user; muted grey with a
     bot icon for the assistant; terminal icon for system.
   - Header line: role name (bold, capitalized) + timestamp (muted 12px).
   - Body: 14px, relaxed line-height, preserves line breaks; code lines render as plain monospace lines.
   - User messages sit on a primary-tinted surface; assistant messages on the card surface with a hairline ring.
   - A message that was navigated to from search has a 2px primary/50% highlight ring.
   Empty state: dashed-border box, centered muted text "No messages yet. Add one below or start chatting with a CLI."
3. Divider.
4. Composer with two tabs (pill-style segmented tab list, left-aligned): "Chat with CLI" (default) and "Add message".

   Tab "Chat with CLI":
   - 3-row textarea, placeholder "Ask Claude Code… (Ctrl/⌘ + Enter to send)".
   - Row beneath: a small select (w≈144px) with "Claude Code" / "Codex", a muted hint text next to it
     ("Resumes the CLI session" or "Starts a new CLI session"), and a solid primary "Send" button with a
     paper-plane icon pushed to the right.
   - Streaming state: above the textarea, the pending user prompt appears as a user bubble, followed by
     an assistant bubble whose text is arriving live; before the first token it shows a small spinner
     with "waiting for Claude Code…". The Send button becomes an outline "■ Stop" button; the textarea
     and select are disabled.
   - After completion a toast "Turn saved" appears bottom-right and both bubbles become permanent messages.
   - Error toast example: "claude exited with code 1 and no reply."
   Tab "Add message":
   - 4-row textarea, placeholder "Paste or type a message…".
   - Row beneath: small select (w≈128px) "User / Assistant / System", muted hint "Ctrl/⌘ + Enter to save",
     small primary "Save message" button on the right. Toast "Message saved".

Dialogs (design both, 384px wide, 12px radius, hairline ring, dimmed blurred backdrop):
- Edit: title "Edit conversation", description "Change the title and tags.", inputs "Title" and "Tags"
  (placeholder "comma, separated"), footer with outline "Cancel" and primary "Save".
- Delete: title "Delete this conversation?", description "“<title>” and its 10 messages will be removed
  from the local database. This cannot be undone.", footer with outline "Cancel" and destructive "Delete".

States to show: populated with ~8 messages; empty; streaming mid-reply; both dialogs. Light and dark.
```

---

## 3. New conversation (`/new`)

```
Design the NEW CONVERSATION screen of mem0.

Purpose: save a chat by hand (paste a transcript) or create an empty conversation to continue with a CLI.

Layout (main column, max ~768px):
- H1 (20px) "New conversation"; muted subtitle "Save a chat by hand, or create an empty one and
  continue it with the Claude / Codex CLI."
- Form, 20px vertical rhythm, labels 14px medium above inputs (32px tall inputs, 8px radius):
  1. Two columns: "Title" input (placeholder "Leave empty to use the first message") taking the remaining
     width, and a 160px "Source" select showing "Claude" (options: Claude, ChatGPT, Codex, Gemini, Other,
     each shown as its coloured pill in the dropdown).
  2. "Tags" input, placeholder "comma, separated, tags".
  3. "Transcript (optional)" — a tall (≈14 rows) monospace textarea (Geist Mono, 12px) with this placeholder:
       Paste a chat. Lines starting with a speaker are split into messages:

       User: how do I center a div?
       Assistant: Use flexbox: display: flex; justify-content: center; align-items: center;
       User: and vertically?
       ...
     Helper text below (muted 12px): "Recognised speakers: User / Human / Me · Assistant / AI / Claude /
     ChatGPT / Codex / Gemini · System. Without markers the whole text is saved as one user message.
     You can add more messages afterwards."
  4. Primary button "Create conversation" (left-aligned). Pending state shows a spinner in the button.
- Error state: a red-tinted bordered box above the button, e.g.
  "Cannot reach Ollama at http://localhost:11434. Start it (ollama serve) and run: ollama pull nomic-embed-text".

States: empty form, filled form with a pasted transcript, error state. Light and dark.
```

---

## 4. Import (`/import`)

```
Design the IMPORT screen of mem0.

Purpose: bring in a ChatGPT or Claude.ai data export (conversations.json) so it becomes searchable memory.

Layout (main column, max ~768px):
- H1 (20px) "Import conversations"; muted subtitle "Bring in your ChatGPT or Claude data export.
  Every message is embedded locally, so large exports take a moment."
- Form:
  1. Label "Export files (.json)" + a file input (accepts multiple .json). Style the file input as a
     bordered 32px row with a "Choose files" affordance and the selected file names; a drop zone
     treatment is welcome but keep it compact.
     Helper text (muted 12px): "ChatGPT: Settings → Data controls → Export → conversations.json.
     Claude: Settings → Privacy → Export data → conversations.json. Generic
     [{ title, messages: [{ role, content }] }] also works." (file names / JSON in monospace).
  2. Label "Fallback source (for generic files)" + a 160px select showing "Other".
  3. Primary button "Import"; while running it is disabled and reads "Embedding & storing…" with a spinner.
- Result panel below the button (rounded, muted background, hairline border):
  - Success: bold line "Imported 2 conversations (1 empty skipped)" then a scrollable list (max ~256px)
    of imported items: linked title + muted "· 14 messages". Example items: "Docker networking · 3 messages",
    "Sorting stability · 2 messages".
  - Nothing found: "No conversations found in those files."
  - Error: red-tinted variant with a bold message, e.g. "File is not valid JSON".

States: idle, files selected, importing, success list, error. Light and dark.
```

---

## 5. Semantic search results (`/search?q=…`)

```
Design the SEARCH RESULTS screen of mem0.

Purpose: show messages that are semantically similar to the query, grouped by conversation, ranked
by similarity, each hit deep-linking to that exact message.

Layout (main column, max ~896px):
- H1 (20px) "Semantic search".
- The same search row as on Home (icon input + primary "Search" button), pre-filled with the query,
  e.g. "feeding a hungry sourdough starter".
- Muted 12px summary line: "7 matching messages in 3 conversations".
- Results: a vertical list of GROUP CARDS (small card, hairline ring). Each group:
  - Header row: source pill · conversation title as a link (heading font, 14px, underline on hover) ·
    date right-aligned (muted 12px).
  - Inside: stacked HIT rows (rounded 10px, muted/30% background, hairline border, hover = muted/60%).
    Each hit shows a 12px meta line "Assistant · similarity 0.76" (role bold) and then a snippet of the
    message (up to ~320 chars, single paragraph). The whole hit is a link.
  Groups are ordered by their best similarity; hits inside a group likewise.
- Similarity values range 0.45–0.85; consider a subtle visual cue for strength (e.g. a tiny 3-segment
  bar or a tinted value) but keep it quiet.

States:
- Results (3 groups, 2–4 hits each, mixed sources).
- No query yet: just the heading and the search row.
- No hits: summary "0 matching messages in 0 conversations" and nothing else (optionally a muted hint
  "Try a different phrasing — search is by meaning, not keywords.").
- Error: red-tinted bordered box, e.g. "Cannot reach Ollama at http://localhost:11434 …".
Light and dark.
```

---

## 6. Optional: small screens

```
The app is desktop-first but should not break below ~1024px. Propose a compact variant of the APP SHELL
where the 288px sidebar collapses into a top bar with the logo, the three action buttons and a
hamburger that opens the conversation list as a sheet/drawer. Show it for the Conversation screen only.
```

---

## Notes for whoever generates the designs

- Keep to the tokens above; do not introduce a new accent colour. Sky blue is the only accent; source
  pills are the only other colour.
- Prefer hairline rings (1px at 10% foreground) over drop shadows; only popovers/dialogs get a soft shadow.
- Do not add marketing chrome (hero art, gradients, testimonials). This is a tool.
- Keep all copy exactly as written in the prompts — it matches the implemented UI.
