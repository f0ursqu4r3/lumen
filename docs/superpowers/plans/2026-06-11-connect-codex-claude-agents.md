# Connect Codex & Claude Code Agents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it one step to wire Claude Code and OpenAI Codex CLI into lumen's existing MCP server — via copy-paste snippets and an optional one-click config writer.

**Architecture:** A pure string generator (`agentConnect.ts`) produces per-agent snippets from `{host, port, token}`. A Bun-host module (`connect.ts`) writes those configs: Claude via `claude mcp add` (PATH) with `~/.claude.json` merge fallback; Codex via a `smol-toml` parse/merge of `~/.codex/config.toml` (with `.bak`). Two new RPC methods expose the writers. The Settings ▸ Agent access pane gains per-agent Connect cards.

**Tech Stack:** TypeScript, Vue 3, Electrobun (Bun host + webview RPC), Vitest, `smol-toml`, reka-ui (`alert-dialog`).

**Spec:** `docs/superpowers/specs/2026-06-11-connect-codex-claude-agents-design.md`

**Conventions:** Tests run with `bunx vitest run` (NOT `bun test`). Run `bun run format` after edits. Commit per task.

---

## File Structure

- Create `src/shared/lib/agentConnect.ts` — pure snippet generator.
- Create `src/shared/lib/agentConnect.test.ts` — generator tests.
- Create `src/bun/mcp/connect.ts` — host writers + pure merge helpers + path helpers.
- Create `src/bun/mcp/connect.test.ts` — writer/merge tests.
- Modify `src/shared/lib/rpcContract.ts` — add `connectClaudeCode`, `connectCodex` to `LumenRequests`.
- Modify `src/shared/lib/rpc.ts` — add the two methods to the typed funnel.
- Modify `src/bun/index.ts` — register the two host handlers.
- Modify `src/features/settings/panes/AgentAccessPane.vue` — generic snippet → per-agent cards + Connect + raw fallback.
- Modify `src/features/settings/panes/AgentAccessPane.test.ts` — card/gating/connect tests.

---

## Task 1: Add `smol-toml` dependency

**Files:**
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Install**

Run: `bun add smol-toml`
Expected: `smol-toml` appears under `dependencies` in `package.json`; `bun.lock` updated.

- [ ] **Step 2: Verify it imports**

Run: `bun -e "import('smol-toml').then(m=>console.log(typeof m.parse, typeof m.stringify))"`
Expected: `function function`

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "build: add smol-toml for Codex config merge"
```

---

## Task 2: Pure snippet generator `agentConnect.ts`

**Files:**
- Create: `src/shared/lib/agentConnect.ts`
- Test: `src/shared/lib/agentConnect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/agentConnect.test.ts
import { describe, it, expect } from 'vitest'
import { buildConnect } from './agentConnect'

const FIX = { host: '127.0.0.1', port: 7437, token: 'lmcp_abc123' }

describe('buildConnect', () => {
  it('builds the Claude Code CLI command with scope, transport, url and bearer header', () => {
    const { claude } = buildConnect(FIX)
    expect(claude.cli).toBe(
      'claude mcp add --scope user --transport http lumen http://127.0.0.1:7437 --header "Authorization: Bearer lmcp_abc123"',
    )
  })

  it('builds a .mcp.json block with an http lumen server', () => {
    const { claude } = buildConnect(FIX)
    expect(JSON.parse(claude.json)).toEqual({
      mcpServers: {
        lumen: {
          type: 'http',
          url: 'http://127.0.0.1:7437',
          headers: { Authorization: 'Bearer lmcp_abc123' },
        },
      },
    })
  })

  it('builds Codex toml with the experimental flag and a [mcp_servers.lumen] table', () => {
    const { codex } = buildConnect(FIX)
    expect(codex.toml).toContain('experimental_use_rmcp_client = true')
    expect(codex.toml).toContain('[mcp_servers.lumen]')
    expect(codex.toml).toContain('url = "http://127.0.0.1:7437"')
    expect(codex.toml).toContain('bearer_token = "lmcp_abc123"')
    expect(codex.toml).toContain('startup_timeout_sec = 10')
    expect(codex.toml).toContain('tool_timeout_sec = 60')
  })

  it('exposes raw url and header for other clients', () => {
    const { raw } = buildConnect(FIX)
    expect(raw.url).toBe('http://127.0.0.1:7437')
    expect(raw.header).toBe('Authorization: Bearer lmcp_abc123')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/shared/lib/agentConnect.test.ts`
Expected: FAIL — cannot find module `./agentConnect`.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/lib/agentConnect.ts

export interface ConnectInput {
  host: string
  port: number
  token: string
}

export interface ConnectSnippets {
  claude: { cli: string; json: string }
  codex: { toml: string }
  raw: { url: string; header: string }
}

/** Pure: build the per-agent connection snippets for lumen's MCP server. */
export function buildConnect({ host, port, token }: ConnectInput): ConnectSnippets {
  const url = `http://${host}:${port}`
  const header = `Authorization: Bearer ${token}`

  const claudeCli =
    `claude mcp add --scope user --transport http lumen ${url} ` + `--header "${header}"`

  const claudeJson = JSON.stringify(
    {
      mcpServers: {
        lumen: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } },
      },
    },
    null,
    2,
  )

  const codexToml = [
    'experimental_use_rmcp_client = true',
    '',
    '[mcp_servers.lumen]',
    `url = "${url}"`,
    `bearer_token = "${token}"`,
    'startup_timeout_sec = 10',
    'tool_timeout_sec = 60',
    '',
  ].join('\n')

  return {
    claude: { cli: claudeCli, json: claudeJson },
    codex: { toml: codexToml },
    raw: { url, header },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/shared/lib/agentConnect.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/shared/lib/agentConnect.ts src/shared/lib/agentConnect.test.ts
git commit -m "feat(agents): pure snippet generator for Claude Code & Codex MCP config"
```

---

## Task 3: Host writer — pure merge helpers + path helpers

**Files:**
- Create: `src/bun/mcp/connect.ts`
- Test: `src/bun/mcp/connect.test.ts`

This task adds only the pure, fs-free pieces (merge functions + path resolvers). The orchestrating `connectClaudeCode`/`connectCodex` come in Task 4.

- [ ] **Step 1: Write the failing test**

```ts
// src/bun/mcp/connect.test.ts
import { describe, it, expect } from 'vitest'
import { mergeClaudeJson, mergeCodexToml } from './connect'
import { parse } from 'smol-toml'

describe('mergeClaudeJson', () => {
  it('adds an http lumen server to an empty config', () => {
    const out = JSON.parse(mergeClaudeJson('', 'http://127.0.0.1:7437', 'lmcp_x'))
    expect(out.mcpServers.lumen).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:7437',
      headers: { Authorization: 'Bearer lmcp_x' },
    })
  })

  it('preserves unrelated keys and other servers, overwriting only lumen', () => {
    const existing = JSON.stringify({
      numStartups: 3,
      mcpServers: { other: { type: 'stdio', command: 'x' }, lumen: { url: 'old' } },
    })
    const out = JSON.parse(mergeClaudeJson(existing, 'http://127.0.0.1:7437', 'lmcp_new'))
    expect(out.numStartups).toBe(3)
    expect(out.mcpServers.other).toEqual({ type: 'stdio', command: 'x' })
    expect(out.mcpServers.lumen.headers.Authorization).toBe('Bearer lmcp_new')
  })
})

describe('mergeCodexToml', () => {
  it('adds the experimental flag and lumen server to an empty config', () => {
    const doc = parse(mergeCodexToml('', 'http://127.0.0.1:7437', 'lmcp_x')) as any
    expect(doc.experimental_use_rmcp_client).toBe(true)
    expect(doc.mcp_servers.lumen).toEqual({
      url: 'http://127.0.0.1:7437',
      bearer_token: 'lmcp_x',
      startup_timeout_sec: 10,
      tool_timeout_sec: 60,
    })
  })

  it('preserves unrelated keys and other servers, overwriting only lumen', () => {
    const existing = [
      'model = "gpt-5"',
      '',
      '[mcp_servers.other]',
      'command = "x"',
      '',
      '[mcp_servers.lumen]',
      'url = "old"',
    ].join('\n')
    const doc = parse(mergeCodexToml(existing, 'http://127.0.0.1:7437', 'lmcp_new')) as any
    expect(doc.model).toBe('gpt-5')
    expect(doc.mcp_servers.other.command).toBe('x')
    expect(doc.mcp_servers.lumen.bearer_token).toBe('lmcp_new')
    expect(doc.mcp_servers.lumen.url).toBe('http://127.0.0.1:7437')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/mcp/connect.test.ts`
Expected: FAIL — cannot find module `./connect`.

- [ ] **Step 3: Write the implementation**

```ts
// src/bun/mcp/connect.ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'smol-toml'

/** Path to Claude Code's user config. Overridable via env for tests. */
export const claudeJsonPath = (): string =>
  process.env.LUMEN_CLAUDE_JSON ?? join(homedir(), '.claude.json')

/** Path to Codex's user config. Overridable via env for tests. */
export const codexConfigPath = (): string =>
  process.env.LUMEN_CODEX_CONFIG ?? join(homedir(), '.codex', 'config.toml')

/** Pure: set mcpServers.lumen to an http entry, preserving everything else. */
export function mergeClaudeJson(existing: string, url: string, token: string): string {
  const doc = (existing.trim() ? JSON.parse(existing) : {}) as Record<string, unknown>
  const servers = (doc.mcpServers ??= {}) as Record<string, unknown>
  servers.lumen = { type: 'http', url, headers: { Authorization: `Bearer ${token}` } }
  return JSON.stringify(doc, null, 2)
}

/** Pure: set [mcp_servers.lumen] + the experimental flag, preserving everything else. */
export function mergeCodexToml(existing: string, url: string, token: string): string {
  const doc = (existing.trim() ? parse(existing) : {}) as Record<string, unknown>
  doc.experimental_use_rmcp_client = true
  const servers = (doc.mcp_servers ??= {}) as Record<string, unknown>
  servers.lumen = {
    url,
    bearer_token: token,
    startup_timeout_sec: 10,
    tool_timeout_sec: 60,
  }
  return stringify(doc)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/bun/mcp/connect.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/bun/mcp/connect.ts src/bun/mcp/connect.test.ts
git commit -m "feat(agents): pure config-merge helpers for Claude & Codex"
```

---

## Task 4: Host writer — `connectClaudeCode` and `connectCodex`

**Files:**
- Modify: `src/bun/mcp/connect.ts`
- Modify: `src/bun/mcp/connect.test.ts`

These orchestrate fs + spawn. They read the live port/token from `loadConfig()`.

- [ ] **Step 1: Write the failing test**

Append to `src/bun/mcp/connect.test.ts`. Use a temp HOME-ish dir via env overrides, and mock `node:child_process` for the Claude PATH probe.

```ts
import { afterEach, beforeEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'

const spawnSync = vi.fn()
vi.mock('node:child_process', () => ({ spawnSync: (...a: unknown[]) => spawnSync(...a) }))

// Imported lazily so the env overrides below are in place first.
import { connectClaudeCode, connectCodex } from './connect'

vi.mock('../config', () => ({
  loadConfig: () => ({ mcp: { enabled: true, port: 7437, token: 'lmcp_live' } }),
}))

let dir: string
beforeEach(() => {
  vi.clearAllMocks()
  dir = mkdtempSync(join(tmpdir(), 'lumen-connect-'))
  process.env.LUMEN_CLAUDE_JSON = join(dir, '.claude.json')
  process.env.LUMEN_CODEX_CONFIG = join(dir, '.codex', 'config.toml')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.LUMEN_CLAUDE_JSON
  delete process.env.LUMEN_CODEX_CONFIG
})

describe('connectClaudeCode', () => {
  it('shells out to `claude mcp add` when claude is on PATH', async () => {
    spawnSync.mockReturnValue({ status: 0, error: undefined }) // probe + add both succeed
    const res = await connectClaudeCode()
    expect(res).toEqual({ ok: true, method: 'cli' })
    const addCall = spawnSync.mock.calls.find((c) => c[1]?.[0] === 'mcp')
    expect(addCall[1]).toEqual([
      'mcp', 'add', '--scope', 'user', '--transport', 'http', 'lumen',
      'http://127.0.0.1:7437', '--header', 'Authorization: Bearer lmcp_live',
    ])
  })

  it('falls back to writing ~/.claude.json when claude is absent', async () => {
    spawnSync.mockReturnValue({ status: null, error: new Error('ENOENT') })
    const res = await connectClaudeCode()
    expect(res).toEqual({ ok: true, method: 'file' })
    const doc = JSON.parse(readFileSync(process.env.LUMEN_CLAUDE_JSON!, 'utf8'))
    expect(doc.mcpServers.lumen.url).toBe('http://127.0.0.1:7437')
  })
})

describe('connectCodex', () => {
  it('writes config.toml and a .bak, merging the lumen server', async () => {
    const cfg = process.env.LUMEN_CODEX_CONFIG!
    mkdirSync(join(dir, '.codex'))
    writeFileSync(cfg, 'model = "gpt-5"\n')
    const res = await connectCodex()
    expect(res).toEqual({ ok: true, method: 'file' })
    expect(existsSync(cfg + '.bak')).toBe(true)
    const doc = parseToml(readFileSync(cfg, 'utf8')) as any
    expect(doc.model).toBe('gpt-5')
    expect(doc.mcp_servers.lumen.bearer_token).toBe('lmcp_live')
  })

  it('creates the .codex dir and file when none exists', async () => {
    const res = await connectCodex()
    expect(res).toEqual({ ok: true, method: 'file' })
    const doc = parseToml(readFileSync(process.env.LUMEN_CODEX_CONFIG!, 'utf8')) as any
    expect(doc.experimental_use_rmcp_client).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/mcp/connect.test.ts`
Expected: FAIL — `connectClaudeCode`/`connectCodex` are not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/bun/mcp/connect.ts` (new imports at top, functions at bottom):

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadConfig } from '../config'

type ConnectResult = { ok: true; method: 'cli' | 'file' } | { ok: false; error: string }

/** Current MCP url + token, or an error string when agent access is off. */
function connection(): { url: string; token: string } | { error: string } {
  const { mcp } = loadConfig()
  if (!mcp?.enabled || !mcp.token) return { error: 'Enable agent access first.' }
  const port = mcp.port ?? 7437
  return { url: `http://127.0.0.1:${port}`, token: mcp.token }
}

function claudeOnPath(): boolean {
  const r = spawnSync('claude', ['--version'], { stdio: 'ignore' })
  return !r.error && r.status === 0
}

export async function connectClaudeCode(): Promise<ConnectResult> {
  const conn = connection()
  if ('error' in conn) return { ok: false, error: conn.error }
  try {
    if (claudeOnPath()) {
      const r = spawnSync(
        'claude',
        [
          'mcp', 'add', '--scope', 'user', '--transport', 'http', 'lumen',
          conn.url, '--header', `Authorization: Bearer ${conn.token}`,
        ],
        { stdio: 'pipe', encoding: 'utf8' },
      )
      if (r.error || r.status !== 0) {
        return { ok: false, error: r.stderr?.trim() || 'claude mcp add failed' }
      }
      return { ok: true, method: 'cli' }
    }
    const path = claudeJsonPath()
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, mergeClaudeJson(existing, conn.url, conn.token))
    return { ok: true, method: 'file' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'failed to connect Claude Code' }
  }
}

export async function connectCodex(): Promise<ConnectResult> {
  const conn = connection()
  if ('error' in conn) return { ok: false, error: conn.error }
  try {
    const path = codexConfigPath()
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
    mkdirSync(dirname(path), { recursive: true })
    if (existing) copyFileSync(path, `${path}.bak`)
    writeFileSync(path, mergeCodexToml(existing, conn.url, conn.token))
    return { ok: true, method: 'file' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'failed to connect Codex' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/bun/mcp/connect.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/bun/mcp/connect.ts src/bun/mcp/connect.test.ts
git commit -m "feat(agents): host writers connectClaudeCode (PATH+fallback) & connectCodex"
```

---

## Task 5: Wire the two RPC methods

**Files:**
- Modify: `src/shared/lib/rpcContract.ts` (add to `LumenRequests`)
- Modify: `src/shared/lib/rpc.ts` (typed funnel)
- Modify: `src/bun/index.ts` (host handlers)

- [ ] **Step 1: Add to the contract**

In `src/shared/lib/rpcContract.ts`, inside `interface LumenRequests`, after `revealMcpToken`:

```ts
  // Write the lumen MCP server into an agent's user config. Claude Code uses
  // `claude mcp add` when on PATH, else merges ~/.claude.json; Codex merges
  // ~/.codex/config.toml (with a .bak). Never throws — returns a structured error.
  connectClaudeCode: () => Promise<
    { ok: true; method: 'cli' | 'file' } | { ok: false; error: string }
  >
  connectCodex: () => Promise<{ ok: true; method: 'file' } | { ok: false; error: string }>
```

- [ ] **Step 2: Add to the funnel**

In `src/shared/lib/rpc.ts`, after the `revealMcpToken` line:

```ts
  connectClaudeCode: () => client().connectClaudeCode(),
  connectCodex: () => client().connectCodex(),
```

- [ ] **Step 3: Register the host handlers**

In `src/bun/index.ts`, add to the import block from `./mcp/server` a sibling import (place directly below that block):

```ts
import { connectClaudeCode, connectCodex } from './mcp/connect'
```

Then in `handlers.requests`, after the `revealMcpToken` handler:

```ts
        connectClaudeCode: async () => connectClaudeCode(),
        connectCodex: async () => connectCodex(),
```

- [ ] **Step 4: Typecheck**

Run: `bunx vitest run src/bun/mcp/connect.test.ts && bun run typecheck`
Expected: connect tests PASS. (Note per gitlab-codegen-workflow memory: pre-existing `src/gitlab/generated` typecheck errors may remain unrelated — confirm no NEW errors reference `connect`, `rpc.ts`, or `index.ts`.)

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/shared/lib/rpcContract.ts src/shared/lib/rpc.ts src/bun/index.ts
git commit -m "feat(agents): expose connectClaudeCode & connectCodex over RPC"
```

---

## Task 6: AgentAccessPane — per-agent Connect cards

**Files:**
- Modify: `src/features/settings/panes/AgentAccessPane.vue`
- Modify: `src/features/settings/panes/AgentAccessPane.test.ts`

Replace the single generic "Client config" block with two agent cards (Claude Code, Codex), each showing labeled snippet block(s) + Copy + a Connect button (confirm via `alert-dialog`), plus a collapsed raw "Other client" fallback. Cards are gated when MCP is off or tokenless.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/settings/panes/AgentAccessPane.test.ts`. Extend the `rpc` mock with the two new methods (add to the `vi.mock` factory and `beforeEach`):

```ts
// add near the other vi.fn() declarations:
const connectClaudeCode = vi.fn()
const connectCodex = vi.fn()
// inside vi.mock('@/shared/lib/rpc', ...) rpc object, add:
//   connectClaudeCode: () => connectClaudeCode(),
//   connectCodex: () => connectCodex(),
// inside beforeEach, add:
//   connectClaudeCode.mockResolvedValue({ ok: true, method: 'cli' })
//   connectCodex.mockResolvedValue({ ok: true, method: 'file' })

describe('AgentAccessPane connect cards', () => {
  it('renders Claude Code and Codex snippets with the real token once enabled', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    expect(w.text()).toContain('Claude Code')
    expect(w.text()).toContain('Codex')
    expect(w.text()).toContain('claude mcp add')
    expect(w.text()).toContain('[mcp_servers.lumen]')
    // token revealed for snippets:
    expect(revealMcpToken).toHaveBeenCalled()
  })

  it('gates the cards when MCP is disabled', async () => {
    getMcpStatus.mockResolvedValue({ enabled: false, port: 7437, running: false, hasToken: false })
    const w = mount(AgentAccessPane)
    await flushPromises()
    expect(w.text()).toContain('Enable agent access first')
    expect(w.text()).not.toContain('claude mcp add')
  })

  it('Connect on the Claude card opens confirm then calls connectClaudeCode', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="connect-claude"]').trigger('click')
    await w.find('[data-testid="connect-claude-confirm"]').trigger('click')
    await flushPromises()
    expect(connectClaudeCode).toHaveBeenCalled()
  })

  it('Connect on the Codex card calls connectCodex', async () => {
    const w = mount(AgentAccessPane)
    await flushPromises()
    await w.find('[data-testid="connect-codex"]').trigger('click')
    await w.find('[data-testid="connect-codex-confirm"]').trigger('click')
    await flushPromises()
    expect(connectCodex).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/features/settings/panes/AgentAccessPane.test.ts`
Expected: FAIL — new selectors/text not present.

- [ ] **Step 3: Implement the pane**

Rework `src/features/settings/panes/AgentAccessPane.vue`. Keep the existing enable/port/token sections unchanged. Replace the `snippet` computed + the final "Client config" `<div>` with the cards below, and load the token after refresh.

Script additions (replace the `snippet` computed; add imports + state):

```ts
import { buildConnect } from '@/shared/lib/agentConnect'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/shared/ui/alert-dialog'

const token = ref<string | null>(null)
const connecting = ref<'claude' | 'codex' | null>(null)

const snippets = computed(() =>
  token.value
    ? buildConnect({ host: '127.0.0.1', port: status.value.port, token: token.value })
    : null,
)
const ready = computed(() => status.value.enabled && status.value.hasToken)

async function loadToken() {
  if (!status.value.hasToken) {
    token.value = null
    return
  }
  const { token: t } = await rpc.revealMcpToken()
  token.value = t
}

async function copy(text: string, label: string) {
  await rpc.clipboardWriteText({ text })
  pushToast({ title: `${label} copied`, tone: 'success' })
}

async function connect(which: 'claude' | 'codex') {
  connecting.value = which
  try {
    const res = which === 'claude' ? await rpc.connectClaudeCode() : await rpc.connectCodex()
    if (res.ok) {
      pushToast({
        title: which === 'claude' ? 'Claude Code connected' : 'Codex connected',
        description: res.method === 'cli' ? 'Added via claude mcp add' : 'Wrote agent config file',
        tone: 'success',
      })
    } else {
      pushToast({ title: 'Connect failed', description: res.error, tone: 'error' })
    }
  } finally {
    connecting.value = null
  }
}
```

Wire `loadToken` into `refresh()` (call it after status assignment), and after `regenerate()` set `token.value = token` from the regenerate result so snippets stay live and add a re-run hint flag:

```ts
// in refresh(), after port.value = status.value.port
await loadToken()
```

In `regenerate()`, after `revealed.value = token`, add:

```ts
  token.value = res.token // keep snippets in sync; written configs now need re-Connect
  needsReconnect.value = true
```

Add `const needsReconnect = ref(false)` to state (set back to `false` at the start of each `connect()`).

Template — replace the final "Client config" `<div>` with (uses `pushToast` description support; if `pushToast` lacks `description`, drop that field):

```vue
    <div v-if="!ready" class="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
      Enable agent access first to connect Claude Code or Codex.
    </div>

    <template v-else>
      <p v-if="needsReconnect" class="font-mono text-2xs text-amber-400">
        Token changed — re-run Connect to update already-configured agents.
      </p>

      <!-- Claude Code -->
      <div class="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-foreground">Claude Code</p>
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button data-testid="connect-claude" size="sm" :disabled="connecting === 'claude'">Connect</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Connect Claude Code?</AlertDialogTitle>
                <AlertDialogDescription>
                  Runs <code>claude mcp add</code> if available, otherwise writes <code>~/.claude.json</code>. Overwrites any existing “lumen” server entry.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction data-testid="connect-claude-confirm" @click="connect('claude')">Connect</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div class="flex items-center justify-between">
          <p class="font-mono text-2xs text-muted-foreground">CLI</p>
          <Button variant="ghost" size="sm" @click="copy(snippets!.claude.cli, 'CLI command')"><Copy class="size-3.5" /> Copy</Button>
        </div>
        <pre class="overflow-auto rounded-lg border border-border/60 bg-card/50 p-3 font-mono text-xs text-muted-foreground">{{ snippets!.claude.cli }}</pre>
        <div class="flex items-center justify-between">
          <p class="font-mono text-2xs text-muted-foreground">.mcp.json</p>
          <Button variant="ghost" size="sm" @click="copy(snippets!.claude.json, '.mcp.json')"><Copy class="size-3.5" /> Copy</Button>
        </div>
        <pre class="overflow-auto rounded-lg border border-border/60 bg-card/50 p-3 font-mono text-xs text-muted-foreground">{{ snippets!.claude.json }}</pre>
      </div>

      <!-- Codex -->
      <div class="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-foreground">Codex CLI</p>
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button data-testid="connect-codex" size="sm" :disabled="connecting === 'codex'">Connect</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Connect Codex?</AlertDialogTitle>
                <AlertDialogDescription>
                  Writes <code>~/.codex/config.toml</code> (a <code>.bak</code> is saved first). Overwrites any existing “lumen” server entry.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction data-testid="connect-codex-confirm" @click="connect('codex')">Connect</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div class="flex items-center justify-between">
          <p class="font-mono text-2xs text-muted-foreground">~/.codex/config.toml</p>
          <Button variant="ghost" size="sm" @click="copy(snippets!.codex.toml, 'Codex config')"><Copy class="size-3.5" /> Copy</Button>
        </div>
        <pre class="overflow-auto rounded-lg border border-border/60 bg-card/50 p-3 font-mono text-xs text-muted-foreground">{{ snippets!.codex.toml }}</pre>
      </div>

      <!-- Other client (raw values) -->
      <div class="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4">
        <p class="font-mono text-2xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Other client</p>
        <p class="font-mono text-xs text-muted-foreground">URL <span class="text-foreground">{{ snippets!.raw.url }}</span></p>
        <div class="flex items-center justify-between gap-2">
          <p class="overflow-auto font-mono text-xs text-muted-foreground">Header <span class="text-foreground">{{ snippets!.raw.header }}</span></p>
          <Button variant="ghost" size="sm" @click="copy(snippets!.raw.header, 'Auth header')"><Copy class="size-3.5" /> Copy</Button>
        </div>
      </div>

      <p class="font-mono text-2xs text-muted-foreground">
        Connections work only while Lumen is running with agent access enabled.
      </p>
    </template>
```

- [ ] **Step 4: Verify pushToast signature**

Run: `grep -n "description\|tone\|title" src/shared/composables/useToast.ts | head`
If `pushToast` has no `description` field, remove `description:` from the `connect()` and dialog toasts in this task (keep `title`/`tone`). Adjust before running tests.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/features/settings/panes/AgentAccessPane.test.ts`
Expected: PASS (existing + 4 new). If the `alert-dialog` renders in a teleport/portal, the confirm button may mount to `document.body` — if a selector misses, query via `document.querySelector('[data-testid="connect-claude-confirm"]')` and dispatch a click, mirroring any existing dialog test in the repo (`grep -rl AlertDialog src/**/*.test.ts`).

- [ ] **Step 6: Format and commit**

```bash
bun run format
git add src/features/settings/panes/AgentAccessPane.vue src/features/settings/panes/AgentAccessPane.test.ts
git commit -m "feat(agents): per-agent Connect cards in Agent access settings"
```

---

## Task 7: Docs — note the agent-connect feature

**Files:**
- Modify: `README.md` (or `docs/` MCP section — locate the existing MCP doc first)

- [ ] **Step 1: Find the MCP docs**

Run: `grep -rln "Agent access\|MCP server\|lumen_" README.md docs --include=*.md`
Expected: one or more files describing the MCP server (e.g. an MCP section in `README.md`).

- [ ] **Step 2: Add a short subsection**

In the located MCP doc, add under the agent-access description:

```markdown
### Connecting agents

Settings ▸ Agent access shows ready-to-paste config for **Claude Code** and
**Codex CLI**, with your live port and token filled in. Use the **Copy** buttons,
or **Connect** to write the config automatically:

- **Claude Code** — runs `claude mcp add --scope user` when the `claude` CLI is
  on your PATH, otherwise merges `~/.claude.json`.
- **Codex** — merges `~/.codex/config.toml` (a `.bak` is written first) and
  enables `experimental_use_rmcp_client`.

Connections work only while Lumen is running with agent access enabled. After
regenerating the token, re-run **Connect** to update already-configured agents.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs
git commit -m "docs(agents): document Claude Code & Codex connect in Agent access"
```

---

## Final verification

- [ ] **Run the full suite**

Run: `bunx vitest run`
Expected: all green (per lumen-test-command memory, use `bunx vitest run`).

- [ ] **Typecheck**

Run: `bun run typecheck`
Expected: no NEW errors in `agentConnect.ts`, `connect.ts`, `rpc*.ts`, `index.ts`, or `AgentAccessPane.vue`. Pre-existing `src/gitlab/generated` errors (codegen) are unrelated and may remain until `bun codegen` is run against the live instance.

- [ ] **Manual smoke (user-run, in the app)**

In `app:dev`: Settings ▸ Agent access → enable → confirm Claude/Codex snippets show the real token → Copy works → Connect Claude (verify `claude mcp list` shows `lumen`) → Connect Codex (verify `~/.codex/config.toml` has `[mcp_servers.lumen]` and a `.bak` exists).
