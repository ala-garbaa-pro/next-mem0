The main open‑source “memory layer” options in 2025–2026 for self‑hosted LLM agents with MCP and cross‑app context are Mem0’s OpenMemory/MCP ecosystem, ai‑memory‑mcp, and mcp‑memory‑service, plus several small Mem0 MCP server templates you can copy‑paste into your own stack. [github](https://github.com/coleam00/mcp-mem0)

Below is a concise map of the best GitHub projects and how to use them as a persistent memory layer across tools and models.

***

## Mem0 OpenMemory MCP (full local “memory server”)

- **Project:** `mem0/openmemory` inside the main Mem0 repo. [mem0](https://mem0.ai/blog/introducing-openmemory-mcp)
- **What it is:** A local‑first memory infrastructure with an MCP server, API, vector DB, and dashboard that gives you a unified memory layer across Claude, Cursor, and any MCP client. [mem0](https://mem0.ai/blog/introducing-openmemory-mcp)
- **Stack:** Docker‑based services (API, vector DB, MCP server, UI) wired together via `make build` / `make up`, plus OpenMemory dashboard at `http://localhost:3000`. [mem0](https://mem0.ai/blog/introducing-openmemory-mcp)
- **Interfaces:**  
  - HTTP API (OpenMemory backend).  
  - MCP endpoint that exposes tools like `add_memories`, `search_memory`, `list_memories`, `delete_all_memories` to any MCP client. [mem0](https://mem0.ai/blog/introducing-openmemory-mcp)
- **Self‑hosting:** You clone `https://github.com/mem0ai/mem0.git`, go into `openmemory`, set `OPENAI_API_KEY` in `api/.env`, then build and run the stack via Docker; MCP clients connect over SSE/HTTP to the local MCP server. [mem0](https://mem0.ai/blog/introducing-openmemory-mcp)

This is the closest thing to a drop‑in, opinionated “memory server” you can run on your own VPS or dev box and share across multiple agents/tools.

***

## Mem0 MCP server (cloud + forks for self‑hosting)

There’s an official MCP server around Mem0, plus several community forks that are essentially copy‑paste templates for a memory adapter.

### Official `mem0-mcp-server` (cloud)

- **Package:** `mem0-mcp-server` on PyPI, wrapping Mem0’s hosted Memory API as MCP tools. [pypi](https://pypi.org/project/mem0-mcp-server/)
- **Features:** Exposes tools for add/search/update/delete long‑term memories; cloud backend gives semantic search and automatic memory extraction. [chatforest](https://chatforest.com/reviews/mem0-mcp-server/)
- **Usage:** Install via `uv pip install mem0-mcp-server` / `pip install mem0-mcp-server`, then configure MCP clients (e.g. Claude Desktop) with `command: "uvx", args: ["mem0-mcp-server"], env: { MEM0_API_KEY: "…" }`. [pypi](https://pypi.org/project/mem0-mcp-server/)
- **Hosting:** Memory is stored on Mem0’s cloud; good if you’re fine with SaaS and want minimal infra. [chatforest](https://chatforest.com/reviews/mem0-mcp-server/)

Note: the older `mem0ai/mem0-mcp` GitHub repo is archived as of March 2026, with guidance to use the newer cloud MCP server instead. [github](https://github.com/mem0ai/mem0-mcp)

### Self‑host oriented Mem0 MCP repos (Python/TS/Node)

These are more “memory adapter templates” you can clone, skim, and reuse in your own agent stack:

- **coleam00/mcp-mem0** – Python MCP server template for Mem0; demonstrates storing, retrieving, and semantic searching of memories. [github](https://github.com/coleam00/mcp-mem0)
- **pinkpixel-dev/mem0-mcp** – Node.js MCP server using the `mem0ai` SDK; exposes a drop‑in MCP memory server for Claude via Smithery or manual build. [github](https://github.com/pinkpixel-dev/mem0-mcp)
- **sadiuysal/mem0-mcp-server-ts** – TypeScript implementation of a Mem0 MCP server using the MCP TS SDK; supports memory streams and semantic search via Mem0. [github](https://github.com/sadiuysal/mem0-mcp-server-ts)
- **ryaker/mcp-mem0-general** – Generic Mem0 MCP server; ships with a detailed USAGE_GUIDE and example prompts for adding/searching memories, designed for copy‑paste workflows. [raw.githubusercontent](https://raw.githubusercontent.com/ryaker/mcp-mem0-general/HEAD/README.md)

These are ideal if you want to quickly see how people wire Mem0 to MCP, then lift the core memory adapter code into your own LangGraph/CrewAI/Next.js agent.

***

## Deep self‑hosted Mem0 stacks (Qdrant/Neo4j/Ollama)

If you want fully self‑hosted vector + graph + LLM, there are more involved setups:

- **tensakulabs/mem0-mcp** – MCP server targeting a self‑hosted Mem0 stack with Qdrant for vectors, Neo4j for graph memory, and Ollama/OpenMemory for the API. [github](https://github.com/tensakulabs/mem0-mcp)
  - Environment vars like `MEM0_QDRANT_URL`, `MEM0_NEO4J_URL`, `MEM0_OLLAMA_URL`, `MEM0_API_BASE`, and `MEM0_USER_ID` let you run everything on localhost or tunnel from a remote VPS. [github](https://github.com/tensakulabs/mem0-mcp)
  - MCP is started via `uvx` and configured in the MCP client config JSON. [github](https://github.com/tensakulabs/mem0-mcp)
- **elvismdev/mem0-mcp-selfhosted** – Self‑hosted Mem0 MCP server for Claude Code, wired to Qdrant + Neo4j + Ollama and exposing 11 MCP tools. [github](https://github.com/elvismdev/mem0-mcp-selfhosted)
  - Can run either Anthropic or Ollama as the main LLM, storing persistent project memory (architecture, conventions, decisions, preferences) and updating when context changes. [github](https://github.com/elvismdev/mem0-mcp-selfhosted)
- **o2alexanderfedin/mem0-mcp-server** – Mem0 MCP server configured for Anthropic Claude, using Docker Compose, Python, and an MCP config snippet for Claude Code. [github](https://github.com/o2alexanderfedin/mem0-mcp-server)
- **KunihiroS/mem0-mcp-for-pm** – Fork of Mem0 MCP tailored for project‑management style structured memory. [github](https://github.com/KunihiroS/mem0-mcp-for-pm)

These are more infrastructure‑heavy but give you end‑to‑end control over storage, graph relationships, and local models.

***

## ai‑memory‑mcp (generic persistent memory substrate)

- **Project:** `alphaonedev/ai-memory-mcp` (Rust, Apache 2.0). [alphaonedev.github](https://alphaonedev.github.io/ai-memory-mcp/)
- **What it is:** A single Rust binary that acts as a persistent endpoint memory substrate for any MCP‑compatible AI assistant (Claude, ChatGPT, Grok, Cursor, etc.), storing memories in a local SQLite DB and ranking them by multi‑factor relevance. [mcpservers](https://mcpservers.org/servers/alphaonedev/ai-memory-mcp)
- **Interfaces:**  
  - HTTPS / MCP server that any MCP client can point at as an external memory backend. [alphaonedev.github](https://alphaonedev.github.io/ai-memory-mcp/)
- **Deployment:** Install via `curl` script, distro packages, or `cargo install ai-memory`, then run `ai-memory serve --host 127.0.0.1 --port 9077`; MCP clients connect to that host/port. [mcpservers](https://mcpservers.org/servers/alphaonedev/ai-memory-mcp)

This is a good fit if you want a lightweight, language‑agnostic memory layer with strong audit/security features and zero token cost until recall. [mcpservers](https://mcpservers.org/servers/alphaonedev/ai-memory-mcp)

***

## mcp‑memory‑service (REST + MCP backend for agents)

- **Project:** `doobidoo/mcp-memory-service` – “Open‑source persistent memory for AI agent pipelines and Claude.” [github](https://github.com/doobidoo/mcp-memory-service)
- **What it is:** A backend with REST API, MCP, OAuth, CLI, and dashboard, designed as a single self‑hosted memory service for LangGraph, CrewAI, AutoGen, Claude Desktop, and generic HTTP clients. [github](https://github.com/doobidoo/mcp-memory-service)
- **Stack:** SQLite‑vec for vector storage plus MiniLM‑L6‑v2 ONNX embeddings; Apache 2.0 license. [github](https://github.com/doobidoo/mcp-memory-service)
- **Deployment:**  
  - Install via `pip install mcp-memory-service` and run `python -m mcp_memory_service.server` with optional OAuth and MCP remote transport enabled. [github](https://github.com/doobidoo/mcp-memory-service)
  - Common pattern is to expose it via Cloudflare Tunnel and add it in Claude connectors using the public tunnel URL. [github](https://github.com/doobidoo/mcp-memory-service)

This is fairly “batteries‑included”: one process providing both HTTP and MCP, designed to be the shared memory backend across multiple agents and desktop assistants. [github](https://github.com/doobidoo/mcp-memory-service)

***

## Compact comparison (for quick selection)

| Project | Tech / Storage | Interface | Self‑hosting profile | License / Cost | Best fit |
|--------|-----------------|----------|----------------------|----------------|----------|
| Mem0 OpenMemory MCP [mem0](https://mem0.ai/blog/introducing-openmemory-mcp) | Docker stack, vector DB + API + UI | MCP + HTTP | Local‑first, but uses OpenAI by default [mem0](https://mem0.ai/blog/introducing-openmemory-mcp) | Mixed; Mem0 core is Apache‑style, infra cost only [mem0](https://mem0.ai/blog/introducing-openmemory-mcp) | “Full” memory server with dashboard and semantic features |
| mem0‑mcp‑server (cloud) [pypi](https://pypi.org/project/mem0-mcp-server/) | Python MCP wrapper around Mem0 cloud | MCP | Minimal infra; memories stored on Mem0’s platform [chatforest](https://chatforest.com/reviews/mem0-mcp-server/) | Proprietary SaaS, free tier + API pricing [chatforest](https://chatforest.com/reviews/mem0-mcp-server/) | Quick MCP memory for Claude/Cursor without self‑hosting |
| mem0 MCP templates (coleam00 / pinkpixel / TS) [github](https://github.com/coleam00/mcp-mem0) | Python, Node, TypeScript | MCP | Self‑hostable as small services; Mem0 can be cloud or self‑host behind them [github](https://github.com/coleam00/mcp-mem0) | OSS repos plus Mem0 terms | Copy‑paste adapters / starting points for custom agents |
| tensakulabs / elvismdev Mem0 stacks [github](https://github.com/elvismdev/mem0-mcp-selfhosted) | Python + Qdrant + Neo4j + Ollama/OpenMemory | MCP | Fully self‑hosted vector+graph+LLM, remote deploy via SSH tunnels [github](https://github.com/elvismdev/mem0-mcp-selfhosted) | OSS + infra cost | Deep infra control, serious multi‑project context |
| ai‑memory‑mcp [alphaonedev.github](https://alphaonedev.github.io/ai-memory-mcp/) | Rust + SQLite | MCP / HTTPS | Single binary, very lightweight; local SQLite storage [alphaonedev.github](https://alphaonedev.github.io/ai-memory-mcp/) | Apache 2.0, $0 software [alphaonedev.github](https://alphaonedev.github.io/ai-memory-mcp/) | Generic, model‑agnostic persistent memory substrate |
| mcp‑memory‑service [github](https://github.com/doobidoo/mcp-memory-service) | Python + SQLite‑vec + MiniLM ONNX | REST + MCP + OAuth | Single service; often tunnelled to desktops via Cloudflare [github](https://github.com/doobidoo/mcp-memory-service) | Apache 2.0, infra cost only [github](https://github.com/doobidoo/mcp-memory-service) | Unified memory backend for LangGraph/CrewAI + MCP assistants |

***

## Copy‑paste friendly “memory adapter” patterns

For your use case (multiple projects, different agents and LLMs), the easiest way to get a reusable memory layer is to lift adapter patterns from these repos:

- **MCP tool set as the abstraction:** Most of these servers expose a small set of tools—`add_memory/add_memories`, `search_memory`, `list_memories`, `delete_memory/delete_all_memories`, sometimes `update_memory`—which is all you need for a generic memory client in each agent. [raw.githubusercontent](https://raw.githubusercontent.com/ryaker/mcp-mem0-general/HEAD/README.md)
- **Simple env‑driven config:** Repos like `elvismdev/mem0-mcp-selfhosted` and `tensakulabs/mem0-mcp` show how to wire storage and models using `MEM0_*` environment variables and then reference them from MCP configs (Claude Code, JSON `mcpServers`). [github](https://github.com/elvismdev/mem0-mcp-selfhosted)
- **Guide‑driven workflows:** `mcp-mem0-general` ships a USAGE_GUIDE with example prompts for adding a long doc as memory and later retrieving by ID or semantic search; you can re‑use those exact prompts in your own “memory injection” flows. [raw.githubusercontent](https://raw.githubusercontent.com/ryaker/mcp-mem0-general/HEAD/README.md)
- **Language‑agnostic endpoints:** ai‑memory‑mcp and mcp‑memory‑service give clean HTTP + MCP endpoints so any Next.js/SaaS backend can post events (user actions, session summaries) and later query relevant memories for context injection. [alphaonedev.github](https://alphaonedev.github.io/ai-memory-mcp/)

In practice, you’d standardize a small memory client lib (e.g. `saveMemory(text, tags)` / `getContext(query)`), then plug it into LangGraph, CrewAI, Claude connectors, and your own apps by pointing all of them at one of these servers.

***

## Practical picks for you

Given you’re running multiple SaaS and local‑service projects and probably want **self‑hosted, low‑cost, cross‑tool context**:

- If you want **full stack + UI + semantic features** and are okay with Docker and OpenAI, start with **Mem0 OpenMemory MCP** and treat it as your “memory hub” for all agents. [mem0](https://mem0.ai/blog/introducing-openmemory-mcp)
- If you want **minimal binary + SQLite, entirely self‑contained**, go with **ai‑memory‑mcp**, install it on your VPS, and configure Claude/ChatGPT/Cursor to treat it as the shared MCP memory server. [alphaonedev.github](https://alphaonedev.github.io/ai-memory-mcp/)
- If you want **one backend for LangGraph/CrewAI/AutoGen and desktop assistants**, deploy **mcp‑memory‑service** and standardize all your tools to call its REST/MCP interfaces. [github](https://github.com/doobidoo/mcp-memory-service)
- For **code examples and adapters**, browse `coleam00/mcp-mem0`, `pinkpixel-dev/mem0-mcp`, and `mcp-mem0-general` to copy the MCP tool definitions and wiring into your own Next.js or Python agent orchestration layer. [github](https://github.com/pinkpixel-dev/mem0-mcp)

If you tell me your preferred stack (Python + LangGraph vs Node + custom orchestrator vs pure MCP desktop), I can sketch a concrete “memory adapter” module and MCP config you can drop into your projects.