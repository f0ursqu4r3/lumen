# MCP Server (GitLab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, opt-in, localhost-only, bearer-authenticated in-process MCP server in the Bun main process that exposes a full suite of GitLab tools (issues, merge requests, labels & milestones, users & search) to external agents.

**Architecture:** A self-contained `src/bun/mcp/` module. `Bun.serve` binds `127.0.0.1` and gates every request on a bearer token, then hands the `Request` to the SDK's web-standard streamable-HTTP transport (verified to run under Bun) in stateless JSON mode — a fresh `McpServer` + transport per request. Tools are plain `McpTool` objects (`{ name, description, inputSchema, handler }`) collected in a registry and registered with the SDK. GitLab tools hand-write GraphQL query strings (no codegen dependency) and call the existing `gitlabGraphql`/`gitlabRest` clients directly, reusing the 401/403/5xx error semantics from `src/gitlab/errors.ts`.

**Tech Stack:** Bun, `@modelcontextprotocol/sdk@^1.29`, `zod@^4`, TypeScript, Vitest. The app is Electrobun (Bun main process + Vue webview); this plan touches only the Bun process plus `src/bun/config.ts`.

**Scope:** Phase 1 (foundation: transport, auth, registry, config, lifecycle) + Phase 2 (GitLab tools). The app-control bridge and the Settings UI are **deferred to a follow-up plan** — until then the server is enabled by hand-editing `config.json` (documented in the final task).

**Verified facts (don't re-litigate):**
- The SDK's `WebStandardStreamableHTTPServerTransport` runs under Bun. A smoke test of `Bun.serve` → bearer gate → `transport.handleRequest(req)` passed `initialize`, `tools/list`, and `tools/call` in stateless mode (`sessionIdGenerator: undefined`, `enableJsonResponse: true`). The transport uses Web-standard `Request`/`Response`, so the request handler is testable under Vitest (node) without `Bun.serve`.
- `registerTool(name, { description, inputSchema }, handler)` where `inputSchema` is a Zod raw shape (object of zod schemas); the SDK auto-converts it to JSON Schema for `tools/list` and validates `tools/call` args.
- GitLab GraphQL: `iid` arguments are `String`. `CreateIssueInput.labels` accepts label **title strings**; everything else label/assignee/milestone-related (`assigneeIds`, `milestoneId`, `UpdateIssueInput.labelIds`, `MergeRequestSetLabelsInput.labelIds`) requires **GlobalIDs** (`gid://gitlab/Label/1`). `createNote.noteableId` is the issue/MR global `id`. There is **no** GraphQL approve mutation — approve/unapprove are REST `POST` (no body). There is **no** cross-project search.

---

## File Structure

```
src/bun/
  config.ts                # MODIFY: add `mcp` to AppConfig + load/save/setMcp helpers
  config.test.ts           # MODIFY: cover mcp load/save round-trip
  index.ts                 # MODIFY: call startMcpIfEnabled() after window boot
  mcp/
    types.ts               # McpTool, CallToolResult re-export, text()/errorResult() helpers
    types.test.ts
    auth.ts                # generateToken(), isAuthorized(req, token)
    auth.test.ts
    registry.ts            # allTools array + registerTools(server, tools)
    registry.test.ts
    server.ts              # createMcpFetch(), startMcp/stopMcp/startMcpIfEnabled/setMcpEnabled, lifecycle
    server.test.ts
    server.integration.test.ts   # initialize + tools/list + tools/call over createMcpFetch
    gitlab/
      client.ts            # gql()/rest() wrappers + resolveLabelIds/resolveUserIds/resolveMilestoneId
      client.test.ts
      issues.ts            # issueTools: list/get/create/update/comment
      issues.test.ts
      mergeRequests.ts     # mrTools: list/get/comment/review
      mergeRequests.test.ts
      labelsMilestones.ts  # labelTools: labels_list, milestones_list
      labelsMilestones.test.ts
      usersSearch.ts       # userTools: me, members_list, search
      usersSearch.test.ts
```

Each file has one responsibility and its own `*.test.ts`, matching repo convention. Tests run with `bunx vitest run` (NOT `bun test`).

---

# PHASE 1 — Foundation

## Task 1: Install the SDK and pin deps

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Install**

Run:
```bash
cd /Users/la.kyle.dougan/git/personal/lumen
bun add @modelcontextprotocol/sdk@^1.29.0
```
(`zod@^4` is pulled in transitively by the SDK and is importable as `zod`. Confirm with `ls node_modules/zod/package.json`.)

- [ ] **Step 2: Verify it resolves under Bun**

Run:
```bash
bun -e "import('@modelcontextprotocol/sdk/server/mcp.js').then(m=>console.log(typeof m.McpServer)); import('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js').then(m=>console.log(typeof m.WebStandardStreamableHTTPServerTransport))"
```
Expected: prints `function` twice.

- [ ] **Step 3: Commit**

```bash
bun run format
git add package.json bun.lock
git commit -m "build(mcp): add @modelcontextprotocol/sdk"
```

---

## Task 2: Extend config with `mcp`

**Files:**
- Modify: `src/bun/config.ts`
- Test: `src/bun/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/bun/config.test.ts` (it already uses a temp `LUMEN_CONFIG_DIR` per test — reuse that harness):

```typescript
import { loadConfig, saveConfig, saveMcpConfig } from './config'

it('defaults mcp to null when absent', () => {
  expect(loadConfig().mcp).toBeNull()
})

it('saveMcpConfig persists mcp and preserves the gitlab token', () => {
  saveConfig({ url: 'https://gl.example.com', token: 'glpat-abc' })
  saveMcpConfig({ enabled: true, port: 7437, token: 'lmcp_xyz' })
  const cfg = loadConfig()
  expect(cfg.mcp).toEqual({ enabled: true, port: 7437, token: 'lmcp_xyz' })
  expect(cfg.token).toBe('glpat-abc')
})

it('saveConfig preserves an existing mcp block', () => {
  saveMcpConfig({ enabled: true, port: 7437, token: 'lmcp_xyz' })
  saveConfig({ url: 'https://gl.example.com', token: 'glpat-abc' })
  expect(loadConfig().mcp).toEqual({ enabled: true, port: 7437, token: 'lmcp_xyz' })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/config.test.ts`
Expected: FAIL — `saveMcpConfig` is not exported / `mcp` undefined.

- [ ] **Step 3: Implement**

In `src/bun/config.ts`, extend the interface and add helpers. Replace the `AppConfig` interface and `saveConfig`, and add `McpConfig` + `saveMcpConfig` + a shared `persist`:

```typescript
export interface McpConfig {
  enabled: boolean
  port: number
  token: string | null
}

export interface AppConfig {
  gitlabUrl: string | null
  token: string | null
  mcp: McpConfig | null
}
```

In `loadConfig`, where it currently returns the parsed config from disk, include `mcp`:

```typescript
    return {
      gitlabUrl: raw.gitlabUrl ? trimSlash(raw.gitlabUrl) : null,
      token: raw.token ?? null,
      mcp: raw.mcp ?? null,
    }
```

And the env-import and empty fallbacks gain `mcp: null`:

```typescript
  if (envUrl && envToken) return { gitlabUrl: trimSlash(envUrl), token: envToken, mcp: null }
  return { gitlabUrl: null, token: null, mcp: null }
```

Add a shared writer and refactor `saveConfig` to use it, plus the new `saveMcpConfig`:

```typescript
function persist(data: AppConfig): void {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(data, null, 2), { mode: 0o600 })
}

export function saveConfig(input: { url: string; token?: string }): void {
  const current = loadConfig()
  const token = input.token ?? current.token
  if (!token) throw new Error('GitLab token is required')
  persist({ gitlabUrl: trimSlash(input.url), token, mcp: current.mcp })
}

export function saveMcpConfig(mcp: McpConfig): void {
  const current = loadConfig()
  persist({ gitlabUrl: current.gitlabUrl, token: current.token, mcp })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/config.test.ts`
Expected: PASS (all existing config tests still pass).

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/config.ts src/bun/config.test.ts
git commit -m "feat(mcp): add mcp config block (load/save)"
```

---

## Task 3: Tool types + result helpers

**Files:**
- Create: `src/bun/mcp/types.ts`
- Test: `src/bun/mcp/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { text, errorResult } from './types'

describe('result helpers', () => {
  it('text() wraps a string as a single text content block', () => {
    expect(text('hello')).toEqual({ content: [{ type: 'text', text: 'hello' }] })
  })

  it('text() serializes a non-string value as pretty JSON', () => {
    expect(text({ a: 1 })).toEqual({ content: [{ type: 'text', text: '{\n  "a": 1\n}' }] })
  })

  it('errorResult() marks the result isError', () => {
    expect(errorResult('boom')).toEqual({
      content: [{ type: 'text', text: 'boom' }],
      isError: true,
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import type { ZodRawShape } from 'zod'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export type { CallToolResult }

/** A single MCP tool: a name, a description, a Zod raw-shape input schema, and a handler. */
export interface McpTool {
  name: string
  description: string
  inputSchema: ZodRawShape
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>
}

/** Wrap a value as a tool result. Strings pass through; everything else is pretty JSON. */
export function text(value: unknown): CallToolResult {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return { content: [{ type: 'text', text: body }] }
}

/** A tool error result (the SDK also catches thrown errors, but this lets us shape the message). */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/mcp/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/mcp/types.ts src/bun/mcp/types.test.ts
git commit -m "feat(mcp): tool types and result helpers"
```

---

## Task 4: Bearer auth

**Files:**
- Create: `src/bun/mcp/auth.ts`
- Test: `src/bun/mcp/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { generateToken, isAuthorized } from './auth'

const req = (auth?: string) =>
  new Request('http://127.0.0.1/', { headers: auth ? { authorization: auth } : {} })

describe('mcp auth', () => {
  it('generates a prefixed, non-trivial token', () => {
    const t = generateToken()
    expect(t).toMatch(/^lmcp_[A-Za-z0-9_-]{20,}$/)
    expect(generateToken()).not.toBe(t)
  })

  it('accepts the exact bearer token', () => {
    expect(isAuthorized(req('Bearer secret'), 'secret')).toBe(true)
  })

  it('rejects a missing, malformed, or wrong token', () => {
    expect(isAuthorized(req(), 'secret')).toBe(false)
    expect(isAuthorized(req('secret'), 'secret')).toBe(false)
    expect(isAuthorized(req('Bearer nope'), 'secret')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import { randomBytes } from 'node:crypto'

/** A fresh server token: `lmcp_` + 24 random bytes, url-safe base64. */
export function generateToken(): string {
  return `lmcp_${randomBytes(24).toString('base64url')}`
}

/** True only when the request carries exactly `Authorization: Bearer <token>`. */
export function isAuthorized(req: Request, token: string): boolean {
  return req.headers.get('authorization') === `Bearer ${token}`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/mcp/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/mcp/auth.ts src/bun/mcp/auth.test.ts
git commit -m "feat(mcp): bearer token generate/verify"
```

---

## Task 5: Tool registry

**Files:**
- Create: `src/bun/mcp/registry.ts`
- Test: `src/bun/mcp/registry.test.ts`

Phase 1 ships an empty `allTools`; Phase 2's final task fills it from the gitlab tool modules (shown there).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { registerTools } from './registry'
import type { McpTool } from './types'

describe('registerTools', () => {
  it('registers each tool with the SDK server', () => {
    const registerTool = vi.fn()
    const server = { registerTool } as never
    const tools: McpTool[] = [
      {
        name: 'lumen_demo',
        description: 'demo',
        inputSchema: { x: z.string() },
        handler: async () => ({ content: [] }),
      },
    ]
    registerTools(server, tools)
    expect(registerTool).toHaveBeenCalledTimes(1)
    expect(registerTool).toHaveBeenCalledWith(
      'lumen_demo',
      { description: 'demo', inputSchema: { x: expect.anything() } },
      expect.any(Function),
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpTool } from './types'

/** Every tool the server exposes. Phase 2 appends the gitlab tool arrays here. */
export const allTools: McpTool[] = []

/** Register the given tools (default: all) with an SDK server instance. */
export function registerTools(server: McpServer, tools: McpTool[] = allTools): void {
  for (const t of tools) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.inputSchema },
      t.handler as never,
    )
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/mcp/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/mcp/registry.ts src/bun/mcp/registry.test.ts
git commit -m "feat(mcp): tool registry"
```

---

## Task 6: Request handler + lifecycle

**Files:**
- Create: `src/bun/mcp/server.ts`
- Test: `src/bun/mcp/server.test.ts`
- Test: `src/bun/mcp/server.integration.test.ts`

- [ ] **Step 1: Write the failing lifecycle test**

`src/bun/mcp/server.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { loadConfig, saveMcpConfig } = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveMcpConfig: vi.fn(),
}))
vi.mock('../config', () => ({ loadConfig, saveMcpConfig }))

import { startMcp, stopMcp, startMcpIfEnabled, isRunning } from './server'

const fakeServe = vi.fn(() => ({ stop: vi.fn() }))

beforeEach(() => {
  loadConfig.mockReset()
  saveMcpConfig.mockReset()
  fakeServe.mockClear()
  vi.stubGlobal('Bun', { serve: fakeServe })
})
afterEach(() => {
  stopMcp()
  vi.unstubAllGlobals()
})

describe('mcp server lifecycle', () => {
  it('startMcp binds 127.0.0.1 on the given port and reports running', () => {
    const r = startMcp(7437, 'tok')
    expect(r).toEqual({ ok: true })
    expect(fakeServe).toHaveBeenCalledTimes(1)
    expect(fakeServe.mock.calls[0][0]).toMatchObject({ hostname: '127.0.0.1', port: 7437 })
    expect(isRunning()).toBe(true)
  })

  it('startMcp is idempotent (a second call does not re-serve)', () => {
    startMcp(7437, 'tok')
    startMcp(7437, 'tok')
    expect(fakeServe).toHaveBeenCalledTimes(1)
  })

  it('reports a port-in-use error instead of throwing', () => {
    fakeServe.mockImplementationOnce(() => {
      throw new Error('EADDRINUSE')
    })
    const r = startMcp(7437, 'tok')
    expect(r.ok).toBe(false)
    expect(isRunning()).toBe(false)
  })

  it('startMcpIfEnabled starts only when enabled with a token', () => {
    loadConfig.mockReturnValue({ mcp: { enabled: false, port: 7437, token: 'tok' } })
    startMcpIfEnabled()
    expect(fakeServe).not.toHaveBeenCalled()

    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: null } })
    startMcpIfEnabled()
    expect(fakeServe).not.toHaveBeenCalled()

    loadConfig.mockReturnValue({ mcp: { enabled: true, port: 7437, token: 'tok' } })
    startMcpIfEnabled()
    expect(fakeServe).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/bun/mcp/server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { loadConfig, saveMcpConfig } from '../config'
import { isAuthorized } from './auth'
import { registerTools } from './registry'

const SERVER_NAME = 'lumen'
const SERVER_VERSION = '0.1.0'
export const DEFAULT_MCP_PORT = 7437

// Bun's serve return type isn't available under Vitest (node); keep it loose.
let httpServer: { stop: (closeActive?: boolean) => void } | null = null

function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  registerTools(server)
  return server
}

/**
 * The fetch handler: bearer gate, then a fresh stateless transport + server per
 * request (verified to work under Bun and Vitest, since it uses Web-standard
 * Request/Response). Exported so it can be integration-tested without Bun.serve.
 */
export function createMcpFetch(token: string): (req: Request) => Promise<Response> {
  return async (req) => {
    if (!isAuthorized(req, token)) {
      return new Response('Unauthorized', { status: 401 })
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    const server = buildServer()
    await server.connect(transport)
    return transport.handleRequest(req)
  }
}

export function isRunning(): boolean {
  return httpServer !== null
}

/** Start the listener. Idempotent. Returns a port-in-use (or other) error instead of throwing. */
export function startMcp(port: number, token: string): { ok: true } | { ok: false; error: string } {
  if (httpServer) return { ok: true }
  try {
    httpServer = (globalThis as { Bun: { serve: (o: unknown) => { stop: (c?: boolean) => void } } }).Bun.serve({
      hostname: '127.0.0.1',
      port,
      fetch: createMcpFetch(token),
    })
    return { ok: true }
  } catch (e) {
    httpServer = null
    return { ok: false, error: e instanceof Error ? e.message : 'failed to start MCP server' }
  }
}

export function stopMcp(): void {
  if (httpServer) {
    httpServer.stop(true)
    httpServer = null
  }
}

/** Boot-time: start the server iff config says enabled and a token exists. */
export function startMcpIfEnabled(): { ok: true } | { ok: false; error: string } | null {
  const { mcp } = loadConfig()
  if (!mcp?.enabled || !mcp.token) return null
  return startMcp(mcp.port ?? DEFAULT_MCP_PORT, mcp.token)
}

/**
 * Toggle the server from the (future) Settings UI: persists enabled/port,
 * generates nothing here (caller supplies the token), and (re)starts or stops.
 */
export function setMcpEnabled(enabled: boolean, port: number, token: string | null): { ok: true } | { ok: false; error: string } {
  saveMcpConfig({ enabled, port, token })
  stopMcp()
  if (enabled && token) return startMcp(port, token)
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/mcp/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the integration test (request handler, real transport, no Bun.serve)**

`src/bun/mcp/server.integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createMcpFetch } from './server'

const TOKEN = 'itoken'
const HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2025-06-18',
  authorization: `Bearer ${TOKEN}`,
}
const post = (body: unknown, headers: Record<string, string> = HEADERS) =>
  createMcpFetch(TOKEN)(
    new Request('http://127.0.0.1/', { method: 'POST', headers, body: JSON.stringify(body) }),
  )

describe('mcp request handler (real transport)', () => {
  it('rejects requests without the bearer token', async () => {
    const res = await post(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { 'content-type': 'application/json' },
    )
    expect(res.status).toBe(401)
  })

  it('negotiates initialize', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.result.serverInfo.name).toBe('lumen')
  })

  it('answers tools/list (empty in Phase 1)', async () => {
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    const json = await res.json()
    expect(Array.isArray(json.result.tools)).toBe(true)
  })
})
```

- [ ] **Step 6: Run integration test**

Run: `bunx vitest run src/bun/mcp/server.integration.test.ts`
Expected: PASS (3 tests). `tools/list` returns `[]` until Phase 2.

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/bun/mcp/server.ts src/bun/mcp/server.test.ts src/bun/mcp/server.integration.test.ts
git commit -m "feat(mcp): request handler + start/stop lifecycle"
```

---

## Task 7: Wire startup into the Bun entry

**Files:**
- Modify: `src/bun/index.ts`

- [ ] **Step 1: Add the import**

At the top of `src/bun/index.ts`, alongside the other `./` imports:

```typescript
import { startMcpIfEnabled } from './mcp/server'
```

- [ ] **Step 2: Call it after the main window is created**

Immediately after the `const win = new BrowserWindow({ ... })` block (the main window, ~line 115), add:

```typescript
  // Start the in-process MCP server iff the user enabled it in config. Off by
  // default; localhost-only + bearer-gated (see src/bun/mcp/server.ts).
  startMcpIfEnabled()
```

- [ ] **Step 3: Typecheck and run the full suite**

Run:
```bash
bunx vitest run
bun run typecheck
```
Expected: all tests pass. `typecheck` is clean (no new GraphQL operations in `src/**/*.{ts,vue}` were added — the hand-written MCP query strings live in Bun tool files and are not codegen documents, so the generated-types constraint does not apply).

- [ ] **Step 4: Commit**

```bash
bun run format
git add src/bun/index.ts
git commit -m "feat(mcp): start the server on boot when enabled"
```

**Phase 1 ships here:** an opt-in, localhost-only, bearer-authenticated MCP server that speaks the protocol and serves an (empty) tool list.

---

# PHASE 2 — GitLab tools

All GitLab tools run in the Bun process and call the existing clients directly. The `client.ts` wrapper centralizes error mapping (mirroring `src/gitlab/errors.ts`: 401 or 403-with-body → auth; 5xx or bodyless-403 → unavailable) and the GlobalID resolvers.

## Task 8: GitLab client wrapper + resolvers

**Files:**
- Create: `src/bun/mcp/gitlab/client.ts`
- Test: `src/bun/mcp/gitlab/client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gitlabGraphql, gitlabRest } = vi.hoisted(() => ({
  gitlabGraphql: vi.fn(),
  gitlabRest: vi.fn(),
}))
vi.mock('../../gitlab', () => ({ gitlabGraphql, gitlabRest }))

import { gql, rest, resolveLabelIds, resolveUserIds, resolveMilestoneId } from './client'

beforeEach(() => {
  gitlabGraphql.mockReset()
  gitlabRest.mockReset()
})

describe('gql', () => {
  it('returns data on a clean 200', async () => {
    gitlabGraphql.mockResolvedValue({ status: 200, data: { ok: 1 } })
    expect(await gql('query{x}')).toEqual({ ok: 1 })
  })
  it('throws auth on 401', async () => {
    gitlabGraphql.mockResolvedValue({ status: 401 })
    await expect(gql('query{x}')).rejects.toThrow(/authentication/i)
  })
  it('throws unavailable on a bodyless 403 and on 5xx', async () => {
    gitlabGraphql.mockResolvedValue({ status: 403 })
    await expect(gql('query{x}')).rejects.toThrow(/unavailable/i)
    gitlabGraphql.mockResolvedValue({ status: 503 })
    await expect(gql('query{x}')).rejects.toThrow(/unavailable/i)
  })
  it('surfaces the first GraphQL error message on a 200-with-errors', async () => {
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [{ message: 'Field x missing' }] })
    await expect(gql('query{x}')).rejects.toThrow('Field x missing')
  })
})

describe('rest', () => {
  it('throws on a non-ok response', async () => {
    gitlabRest.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found', body: '' })
    await expect(rest('POST', '/v4/projects/x/merge_requests/1/approve')).rejects.toThrow(/404/)
  })
  it('resolves on ok', async () => {
    gitlabRest.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', body: '{}' })
    await expect(rest('POST', '/v4/x')).resolves.toBeUndefined()
  })
})

describe('resolvers', () => {
  it('resolveLabelIds maps titles to label GlobalIDs', async () => {
    gitlabGraphql.mockResolvedValue({
      status: 200,
      data: { project: { labels: { nodes: [{ id: 'gid://gitlab/Label/1', title: 'bug' }] } } },
    })
    expect(await resolveLabelIds('g/p', ['bug'])).toEqual(['gid://gitlab/Label/1'])
  })
  it('resolveUserIds maps usernames to user GlobalIDs', async () => {
    gitlabGraphql.mockResolvedValue({
      status: 200,
      data: { project: { projectMembers: { nodes: [{ user: { id: 'gid://gitlab/User/7', username: 'ana' } }] } } },
    })
    expect(await resolveUserIds('g/p', ['ana'])).toEqual(['gid://gitlab/User/7'])
  })
  it('resolveMilestoneId maps a title to a milestone GlobalID', async () => {
    gitlabGraphql.mockResolvedValue({
      status: 200,
      data: { project: { milestones: { nodes: [{ id: 'gid://gitlab/Milestone/3', title: 'v1' }] } } },
    })
    expect(await resolveMilestoneId('g/p', 'v1')).toBe('gid://gitlab/Milestone/3')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/gitlab/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import { gitlabGraphql, gitlabRest } from '../../gitlab'

/** Run a GraphQL operation, mapping transport/auth errors like src/gitlab/errors.ts. */
export async function gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await gitlabGraphql({ query, variables })
  if (res.status === 401 || (res.status === 403 && res.errors?.length)) {
    throw new Error('GitLab authentication failed — check the token (scope: api).')
  }
  if (res.status === 403 || res.status >= 500) {
    throw new Error('GitLab is unavailable.')
  }
  if (res.errors?.length) throw new Error(res.errors[0].message)
  return res.data as T
}

/** Run a REST call (method + `/v4`-prefixed path); throw on non-ok. */
export async function rest(method: 'GET' | 'POST', path: string): Promise<void> {
  const res = await gitlabRest({ method, path })
  if (!res.ok) throw new Error(`GitLab request failed (${res.status} ${res.statusText || 'error'}).`)
}

const LABELS_Q = `query($p:ID!,$s:String){project(fullPath:$p){labels(searchTerm:$s,first:50,includeAncestorGroups:true){nodes{id title}}}}`
const MEMBERS_Q = `query($p:ID!,$s:String){project(fullPath:$p){projectMembers(search:$s,first:50){nodes{user{id username}}}}}`
const MILESTONES_Q = `query($p:ID!,$s:String){project(fullPath:$p){milestones(searchTitle:$s,first:50){nodes{id title}}}}`

/** Resolve label titles → label GlobalIDs for the given project. Throws if any title is unknown. */
export async function resolveLabelIds(fullPath: string, titles: string[]): Promise<string[]> {
  if (titles.length === 0) return []
  const data = await gql<{ project: { labels: { nodes: { id: string; title: string }[] } } | null }>(
    LABELS_Q,
    { p: fullPath, s: null },
  )
  const byTitle = new Map((data.project?.labels.nodes ?? []).map((l) => [l.title, l.id]))
  return titles.map((t) => {
    const id = byTitle.get(t)
    if (!id) throw new Error(`Unknown label: "${t}"`)
    return id
  })
}

/** Resolve usernames → user GlobalIDs for the given project. Throws if any username is unknown. */
export async function resolveUserIds(fullPath: string, usernames: string[]): Promise<string[]> {
  if (usernames.length === 0) return []
  const data = await gql<{ project: { projectMembers: { nodes: { user: { id: string; username: string } | null }[] } } | null }>(
    MEMBERS_Q,
    { p: fullPath, s: null },
  )
  const byName = new Map(
    (data.project?.projectMembers.nodes ?? [])
      .map((n) => n.user)
      .filter((u): u is { id: string; username: string } => Boolean(u))
      .map((u) => [u.username, u.id]),
  )
  return usernames.map((u) => {
    const id = byName.get(u)
    if (!id) throw new Error(`Unknown project member: "${u}"`)
    return id
  })
}

/** Resolve a milestone title → its GlobalID for the given project. Throws if unknown. */
export async function resolveMilestoneId(fullPath: string, title: string): Promise<string> {
  const data = await gql<{ project: { milestones: { nodes: { id: string; title: string }[] } } | null }>(
    MILESTONES_Q,
    { p: fullPath, s: title },
  )
  const found = (data.project?.milestones.nodes ?? []).find((m) => m.title === title)
  if (!found) throw new Error(`Unknown milestone: "${title}"`)
  return found.id
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/mcp/gitlab/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/mcp/gitlab/client.ts src/bun/mcp/gitlab/client.test.ts
git commit -m "feat(mcp): gitlab client wrapper + id resolvers"
```

---

## Task 9: Issue tools

**Files:**
- Create: `src/bun/mcp/gitlab/issues.ts`
- Test: `src/bun/mcp/gitlab/issues.test.ts`

Tools: `lumen_issues_list`, `lumen_issue_get`, `lumen_issue_create`, `lumen_issue_update`, `lumen_issue_comment`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({
  gql: vi.fn(),
  resolveLabelIds: vi.fn(),
  resolveUserIds: vi.fn(),
  resolveMilestoneId: vi.fn(),
}))
vi.mock('./client', () => c)

import { issueTools } from './issues'
const tool = (name: string) => issueTools.find((t) => t.name === name)!

beforeEach(() => {
  c.gql.mockReset()
  c.resolveLabelIds.mockReset()
  c.resolveUserIds.mockReset()
  c.resolveMilestoneId.mockReset()
})

describe('lumen_issues_list', () => {
  it('passes filters and returns slim rows', async () => {
    c.gql.mockResolvedValue({
      project: { issues: { nodes: [{ iid: '5', title: 'Boom', state: 'opened', webUrl: 'u', updatedAt: 't', labels: { nodes: [{ title: 'bug' }] }, assignees: { nodes: [{ username: 'ana' }] } }] } },
    })
    const res = await tool('lumen_issues_list').handler({ project: 'g/p', state: 'opened', labels: ['bug'], first: 10 })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('issues('),
      expect.objectContaining({ p: 'g/p', state: 'opened', labelName: ['bug'], first: 10 }),
    )
    expect(res.content[0].text).toContain('"iid": "5"')
  })
})

describe('lumen_issue_get', () => {
  it('queries by iid and includes the description', async () => {
    c.gql.mockResolvedValue({ project: { issue: { iid: '5', title: 'B', description: 'desc', state: 'opened', webUrl: 'u' } } })
    const res = await tool('lumen_issue_get').handler({ project: 'g/p', iid: '5' })
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('issue('), { p: 'g/p', iid: '5' })
    expect(res.content[0].text).toContain('"description": "desc"')
  })
})

describe('lumen_issue_create', () => {
  it('uses label titles directly, resolves assignees + milestone, returns the new issue', async () => {
    c.resolveUserIds.mockResolvedValue(['gid://gitlab/User/7'])
    c.resolveMilestoneId.mockResolvedValue('gid://gitlab/Milestone/3')
    c.gql.mockResolvedValue({ createIssue: { issue: { iid: '9', webUrl: 'u' }, errors: [] } })
    const res = await tool('lumen_issue_create').handler({
      project: 'g/p', title: 'New', description: 'd', labels: ['bug'], assigneeUsernames: ['ana'], milestoneTitle: 'v1',
    })
    expect(c.resolveLabelIds).not.toHaveBeenCalled() // create uses `labels` titles, not ids
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('createIssue'),
      expect.objectContaining({
        input: expect.objectContaining({
          projectPath: 'g/p', title: 'New', description: 'd', labels: ['bug'],
          assigneeIds: ['gid://gitlab/User/7'], milestoneId: 'gid://gitlab/Milestone/3',
        }),
      }),
    )
    expect(res.content[0].text).toContain('"iid": "9"')
  })

  it('returns an error result when the mutation reports errors', async () => {
    c.gql.mockResolvedValue({ createIssue: { issue: null, errors: ['Title is required'] } })
    const res = await tool('lumen_issue_create').handler({ project: 'g/p', title: '' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Title is required')
  })
})

describe('lumen_issue_update', () => {
  it('maps state to stateEvent and resolves label ids', async () => {
    c.resolveLabelIds.mockResolvedValue(['gid://gitlab/Label/1'])
    c.gql.mockResolvedValue({ updateIssue: { issue: { iid: '5', webUrl: 'u' }, errors: [] } })
    await tool('lumen_issue_update').handler({ project: 'g/p', iid: '5', state: 'close', labels: ['bug'] })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('updateIssue'),
      expect.objectContaining({
        input: expect.objectContaining({ projectPath: 'g/p', iid: '5', stateEvent: 'CLOSE', labelIds: ['gid://gitlab/Label/1'] }),
      }),
    )
  })
})

describe('lumen_issue_comment', () => {
  it('looks up the issue global id, then creates a note', async () => {
    c.gql
      .mockResolvedValueOnce({ project: { issue: { id: 'gid://gitlab/Issue/100' } } })
      .mockResolvedValueOnce({ createNote: { note: { id: 'gid://gitlab/Note/1' }, errors: [] } })
    const res = await tool('lumen_issue_comment').handler({ project: 'g/p', iid: '5', body: 'hi' })
    expect(c.gql).toHaveBeenNthCalledWith(2, expect.stringContaining('createNote'), {
      input: { noteableId: 'gid://gitlab/Issue/100', body: 'hi' },
    })
    expect(res.content[0].text).toContain('Comment added')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/gitlab/issues.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import { z } from 'zod'
import type { McpTool } from '../types'
import { text, errorResult } from '../types'
import { gql, resolveLabelIds, resolveUserIds, resolveMilestoneId } from './client'

const LIST_Q = `query($p:ID!,$state:IssuableState,$labelName:[String],$assigneeUsernames:[String!],$milestoneTitle:[String],$search:String,$first:Int,$after:String){
  project(fullPath:$p){ issues(state:$state,labelName:$labelName,assigneeUsernames:$assigneeUsernames,milestoneTitle:$milestoneTitle,search:$search,first:$first,after:$after,sort:UPDATED_DESC){
    nodes{ iid title state webUrl updatedAt labels{nodes{title}} assignees{nodes{username}} milestone{title} }
    pageInfo{ endCursor hasNextPage } } } }`

const GET_Q = `query($p:ID!,$iid:String!){
  project(fullPath:$p){ issue(iid:$iid){
    iid title state description webUrl createdAt updatedAt
    author{username} milestone{title}
    labels{nodes{title}} assignees{nodes{username}}
    discussions{nodes{notes{nodes{body author{username} createdAt}}}} } } }`

const ID_Q = `query($p:ID!,$iid:String!){project(fullPath:$p){issue(iid:$iid){id}}}`

const CREATE_M = `mutation($input:CreateIssueInput!){createIssue(input:$input){issue{iid webUrl} errors}}`
const UPDATE_M = `mutation($input:UpdateIssueInput!){updateIssue(input:$input){issue{iid webUrl} errors}}`
const NOTE_M = `mutation($input:CreateNoteInput!){createNote(input:$input){note{id} errors}}`

export const issueTools: McpTool[] = [
  {
    name: 'lumen_issues_list',
    description: 'List issues in a project, filtered by state, labels, assignee, milestone, or search text. Returns slim rows.',
    inputSchema: {
      project: z.string().describe('Project full path, e.g. "group/project".'),
      state: z.enum(['opened', 'closed', 'all']).optional(),
      labels: z.array(z.string()).optional().describe('Label titles (AND).'),
      assigneeUsername: z.string().optional(),
      milestoneTitle: z.string().optional(),
      search: z.string().optional(),
      first: z.number().int().min(1).max(100).optional().default(20),
      after: z.string().optional().describe('pageInfo.endCursor from a previous page.'),
    },
    handler: async (a) => {
      const data = await gql<{ project: { issues: { nodes: unknown[]; pageInfo: unknown } } | null }>(LIST_Q, {
        p: a.project,
        state: a.state === 'all' ? null : a.state ?? null,
        labelName: (a.labels as string[] | undefined) ?? null,
        assigneeUsernames: a.assigneeUsername ? [a.assigneeUsername] : null,
        milestoneTitle: a.milestoneTitle ? [a.milestoneTitle] : null,
        search: a.search ?? null,
        first: a.first ?? 20,
        after: a.after ?? null,
      })
      const conn = data.project?.issues ?? { nodes: [], pageInfo: {} }
      return text({ issues: conn.nodes, pageInfo: conn.pageInfo })
    },
  },
  {
    name: 'lumen_issue_get',
    description: 'Get full detail for one issue (description, labels, assignees, milestone, comments).',
    inputSchema: { project: z.string(), iid: z.string() },
    handler: async (a) => {
      const data = await gql<{ project: { issue: unknown } | null }>(GET_Q, { p: a.project, iid: a.iid })
      if (!data.project?.issue) return errorResult(`Issue ${a.iid} not found in ${a.project}.`)
      return text(data.project.issue)
    },
  },
  {
    name: 'lumen_issue_create',
    description: 'Create an issue. Labels are titles; assignees are usernames; milestone is a title.',
    inputSchema: {
      project: z.string(),
      title: z.string(),
      description: z.string().optional(),
      labels: z.array(z.string()).optional(),
      assigneeUsernames: z.array(z.string()).optional(),
      milestoneTitle: z.string().optional(),
    },
    handler: async (a) => {
      const input: Record<string, unknown> = { projectPath: a.project, title: a.title }
      if (a.description) input.description = a.description
      if (a.labels) input.labels = a.labels
      if (a.assigneeUsernames) input.assigneeIds = await resolveUserIds(a.project as string, a.assigneeUsernames as string[])
      if (a.milestoneTitle) input.milestoneId = await resolveMilestoneId(a.project as string, a.milestoneTitle as string)
      const data = await gql<{ createIssue: { issue: { iid: string; webUrl: string } | null; errors: string[] } }>(CREATE_M, { input })
      if (data.createIssue.errors.length) return errorResult(data.createIssue.errors.join('; '))
      return text({ created: data.createIssue.issue })
    },
  },
  {
    name: 'lumen_issue_update',
    description: 'Update an issue: title, description, state (close/reopen), labels (replace), assignees, milestone.',
    inputSchema: {
      project: z.string(),
      iid: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      state: z.enum(['close', 'reopen']).optional(),
      labels: z.array(z.string()).optional().describe('Replaces all labels.'),
      assigneeUsernames: z.array(z.string()).optional(),
      milestoneTitle: z.string().optional(),
    },
    handler: async (a) => {
      const input: Record<string, unknown> = { projectPath: a.project, iid: a.iid }
      if (a.title !== undefined) input.title = a.title
      if (a.description !== undefined) input.description = a.description
      if (a.state) input.stateEvent = a.state === 'close' ? 'CLOSE' : 'REOPEN'
      if (a.labels) input.labelIds = await resolveLabelIds(a.project as string, a.labels as string[])
      if (a.assigneeUsernames) input.assigneeIds = await resolveUserIds(a.project as string, a.assigneeUsernames as string[])
      if (a.milestoneTitle) input.milestoneId = await resolveMilestoneId(a.project as string, a.milestoneTitle as string)
      const data = await gql<{ updateIssue: { issue: { iid: string; webUrl: string } | null; errors: string[] } }>(UPDATE_M, { input })
      if (data.updateIssue.errors.length) return errorResult(data.updateIssue.errors.join('; '))
      return text({ updated: data.updateIssue.issue })
    },
  },
  {
    name: 'lumen_issue_comment',
    description: 'Add a comment to an issue.',
    inputSchema: { project: z.string(), iid: z.string(), body: z.string() },
    handler: async (a) => {
      const idData = await gql<{ project: { issue: { id: string } | null } | null }>(ID_Q, { p: a.project, iid: a.iid })
      const noteableId = idData.project?.issue?.id
      if (!noteableId) return errorResult(`Issue ${a.iid} not found in ${a.project}.`)
      const data = await gql<{ createNote: { note: { id: string } | null; errors: string[] } }>(NOTE_M, {
        input: { noteableId, body: a.body },
      })
      if (data.createNote.errors.length) return errorResult(data.createNote.errors.join('; '))
      return text(`Comment added to ${a.project}#${a.iid}.`)
    },
  },
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/mcp/gitlab/issues.test.ts`
Expected: PASS (all 6 `it` blocks).

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/mcp/gitlab/issues.ts src/bun/mcp/gitlab/issues.test.ts
git commit -m "feat(mcp): issue tools (list/get/create/update/comment)"
```

---

## Task 10: Merge-request tools

**Files:**
- Create: `src/bun/mcp/gitlab/mergeRequests.ts`
- Test: `src/bun/mcp/gitlab/mergeRequests.test.ts`

Tools: `lumen_mrs_list`, `lumen_mr_get`, `lumen_mr_comment`, `lumen_mr_review`. Approve/unapprove is REST (`POST /v4/projects/:enc/merge_requests/:iid/approve|unapprove`, no body). Merge is intentionally out for v1.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({ gql: vi.fn(), rest: vi.fn() }))
vi.mock('./client', () => c)

import { mrTools } from './mergeRequests'
const tool = (name: string) => mrTools.find((t) => t.name === name)!

beforeEach(() => {
  c.gql.mockReset()
  c.rest.mockReset()
})

describe('lumen_mrs_list', () => {
  it('passes filters and returns slim rows', async () => {
    c.gql.mockResolvedValue({ project: { mergeRequests: { nodes: [{ iid: '3', title: 'MR', state: 'opened', webUrl: 'u', draft: false }], pageInfo: {} } } })
    const res = await tool('lumen_mrs_list').handler({ project: 'g/p', state: 'opened', authorUsername: 'ana' })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('mergeRequests('),
      expect.objectContaining({ p: 'g/p', state: 'opened', authorUsername: 'ana' }),
    )
    expect(res.content[0].text).toContain('"iid": "3"')
  })
})

describe('lumen_mr_get', () => {
  it('returns detail incl. approvals and diff stats', async () => {
    c.gql.mockResolvedValue({ project: { mergeRequest: { iid: '3', title: 'MR', description: 'd', approved: false, diffStatsSummary: { additions: 1, deletions: 2, fileCount: 1 } } } })
    const res = await tool('lumen_mr_get').handler({ project: 'g/p', iid: '3' })
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('mergeRequest('), { p: 'g/p', iid: '3' })
    expect(res.content[0].text).toContain('"approved": false')
  })
})

describe('lumen_mr_comment', () => {
  it('looks up the MR global id then creates a note', async () => {
    c.gql
      .mockResolvedValueOnce({ project: { mergeRequest: { id: 'gid://gitlab/MergeRequest/50' } } })
      .mockResolvedValueOnce({ createNote: { note: { id: 'gid://gitlab/Note/2' }, errors: [] } })
    const res = await tool('lumen_mr_comment').handler({ project: 'g/p', iid: '3', body: 'lgtm' })
    expect(c.gql).toHaveBeenNthCalledWith(2, expect.stringContaining('createNote'), {
      input: { noteableId: 'gid://gitlab/MergeRequest/50', body: 'lgtm' },
    })
    expect(res.content[0].text).toContain('Comment added')
  })
})

describe('lumen_mr_review', () => {
  it('approve hits the REST approve endpoint with the encoded path', async () => {
    c.rest.mockResolvedValue(undefined)
    const res = await tool('lumen_mr_review').handler({ project: 'group/proj', iid: '3', action: 'approve' })
    expect(c.rest).toHaveBeenCalledWith('POST', '/v4/projects/group%2Fproj/merge_requests/3/approve')
    expect(res.content[0].text).toContain('approved')
  })
  it('unapprove hits the unapprove endpoint', async () => {
    c.rest.mockResolvedValue(undefined)
    await tool('lumen_mr_review').handler({ project: 'group/proj', iid: '3', action: 'unapprove' })
    expect(c.rest).toHaveBeenCalledWith('POST', '/v4/projects/group%2Fproj/merge_requests/3/unapprove')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/gitlab/mergeRequests.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import { z } from 'zod'
import type { McpTool } from '../types'
import { text, errorResult } from '../types'
import { gql, rest } from './client'

const LIST_Q = `query($p:ID!,$state:MergeRequestState,$labelName:[String],$authorUsername:String,$reviewerUsername:String,$search:String,$first:Int,$after:String){
  project(fullPath:$p){ mergeRequests(state:$state,labelName:$labelName,authorUsername:$authorUsername,reviewerUsername:$reviewerUsername,search:$search,first:$first,after:$after,sort:UPDATED_DESC){
    nodes{ iid title state webUrl updatedAt draft sourceBranch targetBranch author{username} reviewers{nodes{username}} labels{nodes{title}} }
    pageInfo{ endCursor hasNextPage } } } }`

const GET_Q = `query($p:ID!,$iid:String!){
  project(fullPath:$p){ mergeRequest(iid:$iid){
    iid title state description webUrl createdAt updatedAt draft sourceBranch targetBranch
    author{username} reviewers{nodes{username}} labels{nodes{title}}
    approved approvedBy{nodes{username}} commitCount detailedMergeStatus
    diffStatsSummary{additions deletions fileCount}
    discussions{nodes{notes{nodes{body author{username} createdAt}}}} } } }`

const ID_Q = `query($p:ID!,$iid:String!){project(fullPath:$p){mergeRequest(iid:$iid){id}}}`
const NOTE_M = `mutation($input:CreateNoteInput!){createNote(input:$input){note{id} errors}}`

export const mrTools: McpTool[] = [
  {
    name: 'lumen_mrs_list',
    description: 'List merge requests in a project, filtered by state, labels, author, reviewer, or search text.',
    inputSchema: {
      project: z.string(),
      state: z.enum(['opened', 'closed', 'merged', 'all']).optional(),
      labels: z.array(z.string()).optional(),
      authorUsername: z.string().optional(),
      reviewerUsername: z.string().optional(),
      search: z.string().optional(),
      first: z.number().int().min(1).max(100).optional().default(20),
      after: z.string().optional(),
    },
    handler: async (a) => {
      const data = await gql<{ project: { mergeRequests: { nodes: unknown[]; pageInfo: unknown } } | null }>(LIST_Q, {
        p: a.project,
        state: a.state === 'all' ? null : a.state ?? null,
        labelName: (a.labels as string[] | undefined) ?? null,
        authorUsername: a.authorUsername ?? null,
        reviewerUsername: a.reviewerUsername ?? null,
        search: a.search ?? null,
        first: a.first ?? 20,
        after: a.after ?? null,
      })
      const conn = data.project?.mergeRequests ?? { nodes: [], pageInfo: {} }
      return text({ mergeRequests: conn.nodes, pageInfo: conn.pageInfo })
    },
  },
  {
    name: 'lumen_mr_get',
    description: 'Get full detail for one merge request (description, diff stats, approvals, comments).',
    inputSchema: { project: z.string(), iid: z.string() },
    handler: async (a) => {
      const data = await gql<{ project: { mergeRequest: unknown } | null }>(GET_Q, { p: a.project, iid: a.iid })
      if (!data.project?.mergeRequest) return errorResult(`MR ${a.iid} not found in ${a.project}.`)
      return text(data.project.mergeRequest)
    },
  },
  {
    name: 'lumen_mr_comment',
    description: 'Add a comment to a merge request.',
    inputSchema: { project: z.string(), iid: z.string(), body: z.string() },
    handler: async (a) => {
      const idData = await gql<{ project: { mergeRequest: { id: string } | null } | null }>(ID_Q, { p: a.project, iid: a.iid })
      const noteableId = idData.project?.mergeRequest?.id
      if (!noteableId) return errorResult(`MR ${a.iid} not found in ${a.project}.`)
      const data = await gql<{ createNote: { note: { id: string } | null; errors: string[] } }>(NOTE_M, {
        input: { noteableId, body: a.body },
      })
      if (data.createNote.errors.length) return errorResult(data.createNote.errors.join('; '))
      return text(`Comment added to ${a.project}!${a.iid}.`)
    },
  },
  {
    name: 'lumen_mr_review',
    description: 'Approve or unapprove a merge request. (Merge is not available in this version.)',
    inputSchema: { project: z.string(), iid: z.string(), action: z.enum(['approve', 'unapprove']) },
    handler: async (a) => {
      const enc = encodeURIComponent(a.project as string)
      await rest('POST', `/v4/projects/${enc}/merge_requests/${a.iid}/${a.action}`)
      return text(`MR ${a.project}!${a.iid} ${a.action === 'approve' ? 'approved' : 'unapproved'}.`)
    },
  },
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/mcp/gitlab/mergeRequests.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/mcp/gitlab/mergeRequests.ts src/bun/mcp/gitlab/mergeRequests.test.ts
git commit -m "feat(mcp): merge-request tools (list/get/comment/review)"
```

---

## Task 11: Labels & milestones tools

**Files:**
- Create: `src/bun/mcp/gitlab/labelsMilestones.ts`
- Test: `src/bun/mcp/gitlab/labelsMilestones.test.ts`

Tools: `lumen_labels_list`, `lumen_milestones_list`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({ gql: vi.fn() }))
vi.mock('./client', () => c)

import { labelTools } from './labelsMilestones'
const tool = (name: string) => labelTools.find((t) => t.name === name)!

beforeEach(() => c.gql.mockReset())

describe('lumen_labels_list', () => {
  it('includes ancestor groups and returns title/color/description', async () => {
    c.gql.mockResolvedValue({ project: { labels: { nodes: [{ title: 'bug', color: '#f00', description: null }] } } })
    const res = await tool('lumen_labels_list').handler({ project: 'g/p' })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('includeAncestorGroups:true'),
      expect.objectContaining({ p: 'g/p' }),
    )
    expect(res.content[0].text).toContain('"title": "bug"')
  })
})

describe('lumen_milestones_list', () => {
  it('filters by state and returns title/state/dueDate', async () => {
    c.gql.mockResolvedValue({ project: { milestones: { nodes: [{ title: 'v1', state: 'active', dueDate: null, webPath: '/p' }] } } })
    const res = await tool('lumen_milestones_list').handler({ project: 'g/p', state: 'active' })
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('milestones('), expect.objectContaining({ p: 'g/p', state: 'active' }))
    expect(res.content[0].text).toContain('"title": "v1"')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/gitlab/labelsMilestones.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import { z } from 'zod'
import type { McpTool } from '../types'
import { text } from '../types'
import { gql } from './client'

const LABELS_Q = `query($p:ID!,$search:String){project(fullPath:$p){labels(searchTerm:$search,includeAncestorGroups:true,first:100){nodes{title color description}}}}`
const MILESTONES_Q = `query($p:ID!,$state:MilestoneStateEnum){project(fullPath:$p){milestones(state:$state,first:100,sort:DUE_DATE_ASC){nodes{title state dueDate startDate webPath}}}}`

export const labelTools: McpTool[] = [
  {
    name: 'lumen_labels_list',
    description: 'List labels available in a project (including ancestor-group labels).',
    inputSchema: { project: z.string(), search: z.string().optional() },
    handler: async (a) => {
      const data = await gql<{ project: { labels: { nodes: unknown[] } } | null }>(LABELS_Q, {
        p: a.project,
        search: a.search ?? null,
      })
      return text({ labels: data.project?.labels.nodes ?? [] })
    },
  },
  {
    name: 'lumen_milestones_list',
    description: 'List milestones in a project, optionally filtered by state.',
    inputSchema: { project: z.string(), state: z.enum(['active', 'closed']).optional() },
    handler: async (a) => {
      const data = await gql<{ project: { milestones: { nodes: unknown[] } } | null }>(MILESTONES_Q, {
        p: a.project,
        state: a.state ?? null,
      })
      return text({ milestones: data.project?.milestones.nodes ?? [] })
    },
  },
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/mcp/gitlab/labelsMilestones.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/mcp/gitlab/labelsMilestones.ts src/bun/mcp/gitlab/labelsMilestones.test.ts
git commit -m "feat(mcp): labels & milestones tools"
```

---

## Task 12: Users & search tools

**Files:**
- Create: `src/bun/mcp/gitlab/usersSearch.ts`
- Test: `src/bun/mcp/gitlab/usersSearch.test.ts`

Tools: `lumen_me`, `lumen_members_list`, `lumen_search`. GitLab has no cross-project search, so `lumen_search` is **project-scoped** over issues and MRs (documented in its description).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({ gql: vi.fn() }))
vi.mock('./client', () => c)

import { userTools } from './usersSearch'
const tool = (name: string) => userTools.find((t) => t.name === name)!

beforeEach(() => c.gql.mockReset())

describe('lumen_me', () => {
  it('returns the current user identity', async () => {
    c.gql.mockResolvedValue({ currentUser: { username: 'ana', name: 'Ana', publicEmail: 'a@x' } })
    const res = await tool('lumen_me').handler({})
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('currentUser'), undefined)
    expect(res.content[0].text).toContain('"username": "ana"')
  })
})

describe('lumen_members_list', () => {
  it('returns project members for assignee/reviewer lookup', async () => {
    c.gql.mockResolvedValue({ project: { projectMembers: { nodes: [{ user: { username: 'ana', name: 'Ana' } }] } } })
    const res = await tool('lumen_members_list').handler({ project: 'g/p', search: 'an' })
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('projectMembers('), expect.objectContaining({ p: 'g/p', search: 'an' }))
    expect(res.content[0].text).toContain('"username": "ana"')
  })
})

describe('lumen_search', () => {
  it('searches issues and MRs within a project', async () => {
    c.gql.mockResolvedValue({
      project: {
        issues: { nodes: [{ iid: '1', title: 'bug here', webUrl: 'u1' }] },
        mergeRequests: { nodes: [{ iid: '2', title: 'fix bug', webUrl: 'u2' }] },
      },
    })
    const res = await tool('lumen_search').handler({ project: 'g/p', query: 'bug' })
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('issues(search:$q'), { p: 'g/p', q: 'bug' })
    const out = JSON.parse(res.content[0].text)
    expect(out.issues).toHaveLength(1)
    expect(out.mergeRequests).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/gitlab/usersSearch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import { z } from 'zod'
import type { McpTool } from '../types'
import { text } from '../types'
import { gql } from './client'

const ME_Q = `query{currentUser{username name publicEmail id}}`
const MEMBERS_Q = `query($p:ID!,$search:String){project(fullPath:$p){projectMembers(search:$search,first:100){nodes{user{username name}}}}}`
const SEARCH_Q = `query($p:ID!,$q:String!){project(fullPath:$p){
  issues(search:$q,first:20,sort:UPDATED_DESC){nodes{iid title state webUrl updatedAt}}
  mergeRequests(search:$q,first:20,sort:UPDATED_DESC){nodes{iid title state webUrl updatedAt}} } }`

export const userTools: McpTool[] = [
  {
    name: 'lumen_me',
    description: "The current user — the identity behind the configured token.",
    inputSchema: {},
    handler: async () => {
      const data = await gql<{ currentUser: unknown }>(ME_Q)
      return text(data.currentUser)
    },
  },
  {
    name: 'lumen_members_list',
    description: 'List project members (for assignee/reviewer lookup).',
    inputSchema: { project: z.string(), search: z.string().optional() },
    handler: async (a) => {
      const data = await gql<{ project: { projectMembers: { nodes: { user: unknown }[] } } | null }>(MEMBERS_Q, {
        p: a.project,
        search: a.search ?? null,
      })
      const members = (data.project?.projectMembers.nodes ?? []).map((n) => n.user).filter(Boolean)
      return text({ members })
    },
  },
  {
    name: 'lumen_search',
    description: 'Search issues and merge requests within a single project by text. (GitLab has no cross-project search; a project is required.)',
    inputSchema: { project: z.string(), query: z.string() },
    handler: async (a) => {
      const data = await gql<{ project: { issues: { nodes: unknown[] }; mergeRequests: { nodes: unknown[] } } | null }>(
        SEARCH_Q,
        { p: a.project, q: a.query },
      )
      return text({ issues: data.project?.issues.nodes ?? [], mergeRequests: data.project?.mergeRequests.nodes ?? [] })
    },
  },
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/bun/mcp/gitlab/usersSearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/bun/mcp/gitlab/usersSearch.ts src/bun/mcp/gitlab/usersSearch.test.ts
git commit -m "feat(mcp): users & (project) search tools"
```

---

## Task 13: Register all tools + end-to-end check

**Files:**
- Modify: `src/bun/mcp/registry.ts`
- Modify: `src/bun/mcp/registry.test.ts`
- Modify: `src/bun/mcp/server.integration.test.ts`

- [ ] **Step 1: Write the failing test (registry now exposes the full catalog)**

Add to `src/bun/mcp/registry.test.ts`:

```typescript
import { allTools } from './registry'

it('exposes the full gitlab tool catalog with unique lumen_-prefixed names', () => {
  const names = allTools.map((t) => t.name)
  expect(names).toEqual(
    expect.arrayContaining([
      'lumen_issues_list', 'lumen_issue_get', 'lumen_issue_create', 'lumen_issue_update', 'lumen_issue_comment',
      'lumen_mrs_list', 'lumen_mr_get', 'lumen_mr_comment', 'lumen_mr_review',
      'lumen_labels_list', 'lumen_milestones_list',
      'lumen_me', 'lumen_members_list', 'lumen_search',
    ]),
  )
  expect(new Set(names).size).toBe(names.length) // unique
  expect(names.every((n) => n.startsWith('lumen_'))).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/bun/mcp/registry.test.ts`
Expected: FAIL — `allTools` is empty.

- [ ] **Step 3: Fill `allTools`**

Replace the `allTools` line in `src/bun/mcp/registry.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpTool } from './types'
import { issueTools } from './gitlab/issues'
import { mrTools } from './gitlab/mergeRequests'
import { labelTools } from './gitlab/labelsMilestones'
import { userTools } from './gitlab/usersSearch'

/** Every tool the server exposes. */
export const allTools: McpTool[] = [...issueTools, ...mrTools, ...labelTools, ...userTools]
```

(Keep the existing `registerTools` function below it unchanged.)

- [ ] **Step 4: Strengthen the integration test (a real tool over the wire, client mocked)**

Add to the top of `src/bun/mcp/server.integration.test.ts` (above the existing imports):

```typescript
import { vi } from 'vitest'
const { gitlabGraphql, gitlabRest } = vi.hoisted(() => ({ gitlabGraphql: vi.fn(), gitlabRest: vi.fn() }))
vi.mock('../gitlab', () => ({ gitlabGraphql, gitlabRest }))
```

And add a test inside the existing `describe`:

```typescript
it('lists the gitlab tools and calls one end-to-end', async () => {
  const list = await (await post({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })).json()
  expect(list.result.tools.map((t: { name: string }) => t.name)).toContain('lumen_me')

  gitlabGraphql.mockResolvedValue({ status: 200, data: { currentUser: { username: 'ana' } } })
  const call = await (
    await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'lumen_me', arguments: {} } })
  ).json()
  expect(call.result.content[0].text).toContain('ana')
})
```

- [ ] **Step 5: Run the affected tests**

Run: `bunx vitest run src/bun/mcp`
Expected: PASS (registry + server + integration).

- [ ] **Step 6: Full suite + typecheck**

Run:
```bash
bunx vitest run
bun run typecheck
```
Expected: all green. (Typecheck is unaffected by hand-written query strings.)

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/bun/mcp/registry.ts src/bun/mcp/registry.test.ts src/bun/mcp/server.integration.test.ts
git commit -m "feat(mcp): register the full gitlab tool catalog"
```

---

## Task 14: Document manual enable + smoke test

Until the Settings UI lands (follow-up plan), the server is enabled by hand-editing `config.json`.

**Files:**
- Modify: `docs/superpowers/specs/2026-06-09-mcp-server-design.md` (append an "Enabling (interim)" note) — or create `docs/mcp-server.md`. Create the doc:
- Create: `docs/mcp-server.md`

- [ ] **Step 1: Write the doc**

```markdown
# MCP Server (interim enable)

The in-app MCP server is off by default. Until the Settings UI lands, enable it
by editing the app config file:

- macOS: `~/Library/Application Support/Lumen/config.json`
- Linux: `~/.config/Lumen/config.json`
- Windows: `%APPDATA%\Lumen\config.json`

Add an `mcp` block (generate a token yourself — any high-entropy string, e.g.
`openssl rand -base64 24`):

    {
      "gitlabUrl": "https://gitlab.example.com",
      "token": "glpat-...",
      "mcp": { "enabled": true, "port": 7437, "token": "<your-bearer-token>" }
    }

Restart Lumen. The server listens on `http://127.0.0.1:7437` and requires
`Authorization: Bearer <your-bearer-token>` on every request.

Point an MCP client at it (streamable HTTP):

    {
      "mcpServers": {
        "lumen": {
          "url": "http://127.0.0.1:7437/",
          "headers": { "Authorization": "Bearer <your-bearer-token>" }
        }
      }
    }
```

- [ ] **Step 2: Manual smoke test (real app, real GitLab — requires VPN)**

With the app running and the config above set:

```bash
TOKEN='<your-bearer-token>'
H=(-H "content-type: application/json" -H "accept: application/json, text/event-stream" -H "mcp-protocol-version: 2025-06-18" -H "authorization: Bearer $TOKEN")
# expect 401 without the header:
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:7437/ -d '{}'
# initialize, then list tools, then call lumen_me:
curl -s "${H[@]}" -X POST http://127.0.0.1:7437/ -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
curl -s "${H[@]}" -X POST http://127.0.0.1:7437/ -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
curl -s "${H[@]}" -X POST http://127.0.0.1:7437/ -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lumen_me","arguments":{}}}'
```
Expected: `401`, then a negotiated `initialize`, the 14-tool list, and your GitLab identity from `lumen_me`.

- [ ] **Step 3: Commit**

```bash
bun run format
git add docs/mcp-server.md
git commit -m "docs(mcp): interim enable + smoke test"
```

---

# Deferred to follow-up plan (NOT in this plan)

- **App-control bridge:** `reportAppState` (webview→bun push), the cached snapshot, the `lumen:mcp-command` drive path, and `app/` tools (`lumen_app_state`, `lumen_app_navigate`, `lumen_app_open_issue`, `lumen_app_notify`). Requires `rpcContract.ts` changes on both sides.
- **Settings UI:** the "Agent access (MCP)" section in `SettingsDialog.vue` (enable toggle, port, token reveal/copy/regenerate, client-config snippet, status line), wired to `setMcpEnabled` and a new `getMcpStatus` RPC. The lifecycle hooks it needs (`setMcpEnabled`, `startMcpIfEnabled`) already exist from Task 6.

---

## Self-Review

**Spec coverage (against `2026-06-09-mcp-server-design.md`):**
- Surface — GitLab data tools: ✅ Tasks 9–12 cover issues (CRUD), MRs (read+triage), labels & milestones, users & search. App control: deferred (explicit, per the approved build-order decision).
- Transport — local HTTP, in-app streamable HTTP: ✅ Task 6 (verified under Bun via spike).
- Lifecycle/auth — opt-in via config, `127.0.0.1` bind, generated bearer: ✅ Tasks 2, 4, 6, 7. (Settings toggle UI deferred; `setMcpEnabled` lifecycle present.)
- Module layout: ✅ matches the spec's `src/bun/mcp/` tree (minus `app/`, deferred).
- Tool catalog (15 names): all present except the spec listed 14 distinct `lumen_*` tools (issues 5, MRs 4, labels/milestones 2, users/search 3) — ✅ all 14 in Task 13's assertion.
- Error handling — 401/unavailable semantics surfaced as tool errors, token never leaked: ✅ Task 8 `gql`/`rest`; handlers return `errorResult`.
- Port-in-use reported not retried: ✅ Task 6 (`startMcp` returns `{ok:false}`).
- Testing — per-handler arg→builder mapping with the client stubbed; registry/auth/lifecycle; runs with `bunx vitest run`: ✅ every task.
- Risk #1 (SDK under Bun): retired by the pre-plan spike.
- Open question (hand-written vs generated GraphQL): resolved → hand-written strings (decided with the user).
- Open question (MR review GraphQL vs REST): resolved → REST (schema has no approve mutation).
- Open question (snapshot fields): N/A here (bridge deferred).

**Placeholder scan:** none — every code/test step contains complete code; every run step has an exact command + expected result.

**Type consistency:** `McpTool` shape (Task 3) is consumed identically in Tasks 5, 9–13. `gql`/`rest`/`resolve*` signatures (Task 8) match every call site. `text`/`errorResult` (Task 3) used consistently. `createMcpFetch`/`startMcp`/`startMcpIfEnabled`/`setMcpEnabled` names match between Task 6 and Task 7. Config helpers `saveMcpConfig`/`loadConfig` match between Task 2 and Task 6.
