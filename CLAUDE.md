@AGENTS.md

# Naming

The app is **next-mem0** — never plain "mem0" (that is an unrelated product). Use it everywhere a
name shows up: UI text, page titles, docs, the extension, package metadata, and **environment
variables, which are prefixed `NEXT_MEM0_`** (e.g. `NEXT_MEM0_ALLOW_SIGNUP`), never `MEM0_`.
Internal identifiers that already exist (`mem0Url`, `__mem0Sql`, the `next_mem0` database) stay as
they are.
