# Connect Codex & Claude Code to lumen — Design

**Date:** 2026-06-11
**Status:** Approved (brainstorming) — ready for implementation plan

## Summary

lumen already runs an opt-in, token-protected MCP server (stateless streamable
HTTP, `127.0.0.1:7437`, `Authorization: Bearer lmcp_…`). This feature makes it
one step to wire the two coding agents — **Claude Code** and **OpenAI Codex
CLI** — into that server. Integration direction is one-way: lumen stays the
**tool provider**; the agents run externally and connect in.

Delivery is **hybrid**: always-available copy-paste snippets (with the live port
and real token filled in) plus an optional **one-click Connect** button that
writes the agent's config for you.

Both agents speak HTTP MCP natively, so no stdio bridge (`mcp-remote`) is needed:

- **Claude Code** — `claude mcp add --transport http …`, or `.mcp.json` with
  `"type":"http"` + `headers`.
- **Codex** — `~/.codex/config.toml` with top-level
  `experimental_use_rmcp_client = true` and a `[mcp_servers.lumen]` table
  (`url`, `bearer_token`, `startup_timeout_sec`, `tool_timeout_sec`). Native
  streamable-HTTP via the rmcp client.

Sources: [Codex MCP docs](https://developers.openai.com/codex/mcp),
[Codex config reference](https://developers.openai.com/codex/config-reference).

## Scope

In scope: Claude Code and Codex CLI, both user-scoped (global) configs; snippets
+ one-click write; a collapsed raw-values fallback for any other HTTP MCP client.

Out of scope (YAGNI): embedding the agents inside lumen; dispatching issues/MRs
to agents; project-scoped `.mcp.json`/`.codex/config.toml`; non-HTTP transports;
managing more than the single `lumen` server entry.

## Architecture / placement

Evolve the existing **Settings ▸ Agent access** pane
(`src/features/settings/panes/AgentAccessPane.vue`). Today it shows enable
toggle, port, token controls, and one generic `<token>` snippet. The generic
snippet is replaced by a **Connect an agent** section: one card per agent, with
real values filled in, copy buttons, and a one-click **Connect** button. The
old generic snippet survives as a collapsed "Other client" block (raw `url` +
`Authorization` header) for anything that isn't Claude or Codex.

## Components

### 1. Config generator — pure module

`src/shared/lib/agentConnect.ts`. Pure, no I/O → unit-tested by snapshotting
output strings.

```ts
buildConnect({ host, port, token }): {
  claude: { cli: string; json: string }   // `claude mcp add …` + .mcp.json block
  codex:  { toml: string }                // experimental flag + [mcp_servers.lumen]
  raw:    { url: string; header: string }
}
```

- **Claude CLI:**
  `claude mcp add --scope user --transport http lumen http://127.0.0.1:7437 --header "Authorization: Bearer lmcp_…"`
- **Claude JSON** (`.mcp.json` / `~/.claude.json` `mcpServers.lumen`):
  `{ "type": "http", "url": "http://127.0.0.1:7437", "headers": { "Authorization": "Bearer lmcp_…" } }`
- **Codex TOML:**
  ```toml
  experimental_use_rmcp_client = true

  [mcp_servers.lumen]
  url = "http://127.0.0.1:7437"
  bearer_token = "lmcp_…"
  startup_timeout_sec = 10
  tool_timeout_sec = 60
  ```
- **raw:** `url = http://127.0.0.1:7437`, `header = Authorization: Bearer lmcp_…`.

Token decision for Codex: use plaintext `bearer_token` (not
`bearer_token_env_var`) so the one-click write keeps the config in sync with
lumen's token and needs no shell-export step. The token is localhost-only and
already lives on the same machine in lumen's own config.

### 2. One-click writer — Bun host (A3 hybrid per-agent)

Two new RPC methods on `LumenRequests` in `src/shared/lib/rpcContract.ts`, with
handlers in the Bun host (alongside the existing MCP RPC handlers). Each is
invoked only after a confirm dialog that shows exactly what will run or be
written.

```ts
connectClaudeCode: () => Promise<
  { ok: true; method: 'cli' | 'file' } | { ok: false; error: string }
>
connectCodex: () => Promise<
  { ok: true; method: 'file' } | { ok: false; error: string }
>
```

- **`connectClaudeCode`** — if `claude` is on `PATH`, spawn
  `claude mcp add --scope user --transport http lumen <url> --header "Authorization: Bearer <token>"`
  (authoritative merge; returns `method: 'cli'`). Otherwise parse+merge
  `~/.claude.json`, setting `mcpServers.lumen` to the HTTP block, write back
  (`method: 'file'`). Idempotent: an existing `lumen` entry is overwritten.
- **`connectCodex`** — read `~/.codex/config.toml` (treat missing as empty),
  write a `config.toml.bak` sibling first, then parse+merge with **`smol-toml`**:
  set top-level `experimental_use_rmcp_client = true` and the
  `[mcp_servers.lumen]` table; write back. Unrelated content/servers preserved;
  only the `lumen` entry is overwritten.

Both create parent dirs as needed and return a structured error (never throw to
the UI). On any failure the always-visible snippet is the fallback.

### 3. UI — AgentAccessPane cards

Each agent card contains: title, a tabbed code block (CLI / file), per-block
**Copy** button, and a **Connect** button → confirm dialog → calls the writer
RPC → toast on success/failure (success names the method, e.g. "Added via
`claude mcp add`" or "Wrote ~/.codex/config.toml"). The real token is fetched
once via the existing `revealMcpToken()` RPC and passed into `buildConnect`.

Cards are **gated**: when MCP is disabled or there is no token, the card shows
"Enable agent access first" (with the existing enable affordance) instead of
snippets/Connect.

## Data flow

1. Pane mounts → `getMcpStatus()` (existing) for port/enabled/hasToken.
2. If enabled + hasToken → `revealMcpToken()` (existing) once → `buildConnect()`
   produces all snippet strings client-side.
3. **Copy** → `clipboardWriteText()` (existing).
4. **Connect** → confirm dialog → `connectClaudeCode()` / `connectCodex()` (new)
   → host writes config → toast.

## Error handling / edge cases

- MCP off / no token → cards gated; no snippets or writes offered.
- `claude` not on PATH → silent fallback to `~/.claude.json` file merge.
- File permission / TOML parse failure → structured error surfaced in toast;
  `.bak` (Codex) left intact; snippet remains for manual use.
- **Token regenerate invalidates already-written configs** → after a
  regenerate, the cards show a "Re-run Connect to update agents" hint.
- Connection only works while lumen is running with MCP enabled → each card
  notes this.

## Testing

- `agentConnect.ts` — snapshot the generated strings per agent for a fixed
  `{ host, port, token }`.
- Codex TOML merge — fresh/empty file; file with other `mcp_servers`; existing
  `lumen` entry (overwrite); unrelated top-level keys preserved; `.bak` written.
- Claude writer — `claude` present (spawn mocked, asserts args) vs absent
  (`~/.claude.json` merge, existing entry overwrite).
- AgentAccessPane — copy writes clipboard; gating when disabled/no token;
  Connect opens confirm then invokes the right RPC; regenerate shows the
  re-run hint.

## Dependencies / surface

- New dependency: `smol-toml` (Codex `config.toml` parse/merge).
- New RPC methods: `connectClaudeCode`, `connectCodex` (+ host handlers).
- New pure module: `src/shared/lib/agentConnect.ts`.
- Reworked: `AgentAccessPane.vue` (generic snippet → per-agent cards + raw
  fallback).
- Reused as-is: `getMcpStatus`, `revealMcpToken`, `clipboardWriteText`,
  `regenerateMcpToken`, `setMcpEnabled`.
