# MCP App-Control Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six `lumen_app_*` MCP tools that let agents read app state, navigate the main window, open native windows, and post notifications.

**Architecture:** A host-side bridge module (`src/bun/mcp/app/bridge.ts`) caches webview snapshots pushed over a new `reportAppState` RPC and holds an injected host-actions object (window openers, notify, main-window drive) so the tool module never imports `src/bun/index.ts` (no import cycle). Drives go host→webview as `executeJavascript` dispatching a `lumen:mcp-command` CustomEvent; a webview composable reports state (debounced) and routes commands.

**Tech Stack:** Bun host (Electrobun), MCP TypeScript SDK, zod, Vue 3 + vue-router, vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-mcp-app-control-design.md`

**Conventions (read first):**
- Run tests with `bunx vitest run <path>` — NOT `bun test` (wrong runner) or `bun run test` (watch mode).
- Run `bun run format` after any code edits, before committing.
- In `src/bun/**`, **value** imports from shared code must be relative (`../shared/...` or `../../shared/...`); the electrobun host build does not resolve tsconfig `@/` paths. `import type` from `@/shared/...` is fine (erased before bundling).
- All iids are **strings** everywhere (matches GitLab tools and the RPC contract).

---

### Task 1: Shared contract types + webview RPC funnel

**Files:**
- Modify: `src/shared/lib/rpcContract.ts`
- Modify: `src/shared/lib/rpc.ts`

- [ ] **Step 1: Add types and the `reportAppState` request to the contract**

In `src/shared/lib/rpcContract.ts`, add above `LumenRequests`:

```ts
// What the main window's webview reports about itself (cached host-side for
// the MCP lumen_app_state tool). Popout windows never report.
export interface AppStateSnapshot {
  route: string // current route path, e.g. /projects/a/b/issues
  view: string // route name, e.g. 'issues'
  projectPath: string | null
  selectedIssueIids: string[] // multi-select state; [] when none
  visibleIssueIids: string[] // iids loaded in the current list/board
}

// Commands the host pushes into the main webview via the lumen:mcp-command
// CustomEvent (MCP lumen_app_navigate). Unknown cmds are ignored by the webview.
export interface McpAppCommand {
  cmd: 'navigate'
  view: string
  project?: string
  iid?: string
}
```

And inside `interface LumenRequests` (after `resetServerHealth`):

```ts
  // Main window pushes its state snapshot on change (debounced webview-side);
  // the host caches it for the MCP app-control read tool.
  reportAppState: (a: AppStateSnapshot) => Promise<{ ok: true }>
```

- [ ] **Step 2: Add the funnel method**

In `src/shared/lib/rpc.ts`, add to the `rpc` object (after `resetServerHealth`):

```ts
  reportAppState: (a) => client().reportAppState(a),
```

- [ ] **Step 3: Verify the suite still passes (type-level change)**

Run: `bunx vitest run src/shared/lib`
Expected: PASS (no behavior change; vitest compiles the contract).

- [ ] **Step 4: Format and commit**

```bash
bun run format
git add src/shared/lib/rpcContract.ts src/shared/lib/rpc.ts
git commit -m "feat(mcp): app-state snapshot + command types in RPC contract"
```

---

### Task 2: Host bridge module

**Files:**
- Create: `src/bun/mcp/app/bridge.ts`
- Test: `src/bun/mcp/app/bridge.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/bun/mcp/app/bridge.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  cacheSnapshot,
  getSnapshot,
  setHostActions,
  getHostActions,
  buildCommandJs,
  __resetBridge,
  type HostActions,
} from './bridge'
import type { AppStateSnapshot } from '@/shared/lib/rpcContract'

const SNAP: AppStateSnapshot = {
  route: '/projects/a/b/issues',
  view: 'issues',
  projectPath: 'a/b',
  selectedIssueIids: ['1'],
  visibleIssueIids: ['1', '2'],
}

beforeEach(() => __resetBridge())

describe('snapshot cache', () => {
  it('is null before the first report', () => {
    expect(getSnapshot()).toBeNull()
  })
  it('returns the latest cached snapshot', () => {
    cacheSnapshot(SNAP)
    cacheSnapshot({ ...SNAP, view: 'home', route: '/' })
    expect(getSnapshot()?.view).toBe('home')
  })
})

describe('host actions', () => {
  it('is null until the host registers', () => {
    expect(getHostActions()).toBeNull()
  })
  it('returns the registered actions object', () => {
    const host: HostActions = {
      openIssueWindow: vi.fn(() => ({ ok: true })),
      openIssuesWindow: vi.fn(() => ({ ok: true })),
      openSettingsWindow: vi.fn(() => ({ ok: true })),
      notify: vi.fn(),
      driveMain: vi.fn(() => ({ ok: true })),
      listWindows: vi.fn(() => []),
    }
    setHostActions(host)
    expect(getHostActions()).toBe(host)
  })
})

describe('buildCommandJs', () => {
  it('dispatches a lumen:mcp-command CustomEvent with the command as detail', () => {
    const js = buildCommandJs({ cmd: 'navigate', view: 'issues', project: 'a/b' })
    expect(js).toBe(
      `window.dispatchEvent(new CustomEvent('lumen:mcp-command',{detail:{"cmd":"navigate","view":"issues","project":"a/b"}}))`,
    )
  })
  it('JSON-escapes quote and backslash injection attempts', () => {
    const js = buildCommandJs({ cmd: 'navigate', view: 'issue', project: `a"})); alert(1); ("`, iid: '5' })
    // The hostile string must stay inside the JSON string literal.
    expect(js).toContain('\\"})); alert(1); (\\"')
    expect(js.startsWith('window.dispatchEvent(')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/bun/mcp/app/bridge.test.ts`
Expected: FAIL — cannot resolve `./bridge`.

- [ ] **Step 3: Implement the bridge**

Create `src/bun/mcp/app/bridge.ts`:

```ts
import type { AppStateSnapshot, McpAppCommand } from '@/shared/lib/rpcContract'

export interface WindowInfo {
  kind: 'main' | 'issue' | 'issues-window' | 'settings'
  key?: string // `${fullPath}#${iid}` for issue windows
}

/**
 * Host capabilities injected by src/bun/index.ts at boot. Dependency-injected
 * (not imported) so mcp/app never imports the entrypoint — no import cycle,
 * and tools are testable with a stub host.
 */
export interface HostActions {
  openIssueWindow: (a: { fullPath: string; iid: string }) => { ok: boolean }
  openIssuesWindow: (a: { fullPath: string; iids: string[] }) => { ok: boolean }
  openSettingsWindow: () => { ok: boolean }
  notify: (a: { title: string; body?: string; subtitle?: string; silent?: boolean }) => void
  /** Run JS in the main window's webview; { ok: false } if it's gone. */
  driveMain: (js: string) => { ok: boolean }
  listWindows: () => WindowInfo[]
}

let snapshot: AppStateSnapshot | null = null
let host: HostActions | null = null

/** Called by the reportAppState RPC handler (main window pushes on change). */
export function cacheSnapshot(s: AppStateSnapshot): void {
  snapshot = s
}

/** Latest main-window snapshot, or null before the first report. */
export function getSnapshot(): AppStateSnapshot | null {
  return snapshot
}

export function setHostActions(h: HostActions): void {
  host = h
}

export function getHostActions(): HostActions | null {
  return host
}

/** The executeJavascript payload for a drive command. JSON.stringify owns escaping. */
export function buildCommandJs(command: McpAppCommand): string {
  return `window.dispatchEvent(new CustomEvent('lumen:mcp-command',{detail:${JSON.stringify(command)}}))`
}

/** Test-only: reset module state between cases. */
export function __resetBridge(): void {
  snapshot = null
  host = null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/bun/mcp/app/bridge.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/bun/mcp/app/bridge.ts src/bun/mcp/app/bridge.test.ts
git commit -m "feat(mcp): app-control bridge — snapshot cache, host actions, command payload"
```

---

### Task 3: The six app tools

**Files:**
- Create: `src/bun/mcp/app/tools.ts`
- Test: `src/bun/mcp/app/tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/bun/mcp/app/tools.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appTools } from './tools'
import { setHostActions, cacheSnapshot, __resetBridge, type HostActions } from './bridge'
import type { CallToolResult } from '../types'

function tool(name: string) {
  const t = appTools.find((t) => t.name === name)
  if (!t) throw new Error(`tool ${name} not found`)
  return t
}

function body(r: CallToolResult): string {
  const c = r.content[0]
  return c?.type === 'text' ? c.text : ''
}

function stubHost(overrides: Partial<HostActions> = {}): HostActions {
  const host: HostActions = {
    openIssueWindow: vi.fn(() => ({ ok: true })),
    openIssuesWindow: vi.fn(() => ({ ok: true })),
    openSettingsWindow: vi.fn(() => ({ ok: true })),
    notify: vi.fn(),
    driveMain: vi.fn(() => ({ ok: true })),
    listWindows: vi.fn(() => [{ kind: 'main' as const }]),
    ...overrides,
  }
  setHostActions(host)
  return host
}

beforeEach(() => __resetBridge())

it('exposes exactly the six lumen_app_ tools', () => {
  expect(appTools.map((t) => t.name).sort()).toEqual([
    'lumen_app_navigate',
    'lumen_app_notify',
    'lumen_app_open_issue',
    'lumen_app_open_issues_window',
    'lumen_app_open_settings',
    'lumen_app_state',
  ])
})

it('every tool errors cleanly when the bridge is uninitialized', async () => {
  for (const t of appTools) {
    const r = await t.handler({ view: 'dashboard', project: 'a/b', iid: '1', iids: ['1'], title: 'x' })
    expect(r.isError).toBe(true)
    expect(body(r)).toContain('bridge not initialized')
  }
})

describe('lumen_app_state', () => {
  it('returns null snapshot + window list before any report', async () => {
    stubHost()
    const r = await tool('lumen_app_state').handler({})
    expect(JSON.parse(body(r))).toEqual({ snapshot: null, windows: [{ kind: 'main' }] })
  })
  it('returns the cached snapshot', async () => {
    stubHost()
    cacheSnapshot({
      route: '/',
      view: 'home',
      projectPath: null,
      selectedIssueIids: [],
      visibleIssueIids: [],
    })
    const r = await tool('lumen_app_state').handler({})
    expect(JSON.parse(body(r)).snapshot.view).toBe('home')
  })
})

describe('lumen_app_navigate', () => {
  it('drives the main window with a navigate command', async () => {
    const host = stubHost()
    const r = await tool('lumen_app_navigate').handler({ view: 'issues', project: 'a/b' })
    expect(r.isError).toBeUndefined()
    expect(host.driveMain).toHaveBeenCalledWith(
      expect.stringContaining('"cmd":"navigate","view":"issues","project":"a/b"'),
    )
  })
  it('requires project for project-scoped views', async () => {
    stubHost()
    const r = await tool('lumen_app_navigate').handler({ view: 'issues' })
    expect(r.isError).toBe(true)
    expect(body(r)).toContain("requires 'project'")
  })
  it('requires iid for detail views', async () => {
    stubHost()
    const r = await tool('lumen_app_navigate').handler({ view: 'issue', project: 'a/b' })
    expect(r.isError).toBe(true)
    expect(body(r)).toContain("requires 'iid'")
  })
  it('reports a note when the main window is gone (not an error)', async () => {
    stubHost({ driveMain: vi.fn(() => ({ ok: false })) })
    const r = await tool('lumen_app_navigate').handler({ view: 'dashboard' })
    expect(r.isError).toBeUndefined()
    expect(JSON.parse(body(r))).toEqual({ ok: false, note: 'main window not open' })
  })
})

describe('window openers', () => {
  it('lumen_app_open_issue calls the host opener directly', async () => {
    const host = stubHost()
    const r = await tool('lumen_app_open_issue').handler({ project: 'a/b', iid: '7' })
    expect(host.openIssueWindow).toHaveBeenCalledWith({ fullPath: 'a/b', iid: '7' })
    expect(JSON.parse(body(r)).ok).toBe(true)
  })
  it('lumen_app_open_issues_window passes the iid list', async () => {
    const host = stubHost()
    await tool('lumen_app_open_issues_window').handler({ project: 'a/b', iids: ['1', '2'] })
    expect(host.openIssuesWindow).toHaveBeenCalledWith({ fullPath: 'a/b', iids: ['1', '2'] })
  })
  it('lumen_app_open_settings takes no args', async () => {
    const host = stubHost()
    await tool('lumen_app_open_settings').handler({})
    expect(host.openSettingsWindow).toHaveBeenCalled()
  })
})

describe('lumen_app_notify', () => {
  it('forwards to the host notifier', async () => {
    const host = stubHost()
    await tool('lumen_app_notify').handler({ title: 'Hi', body: 'there', silent: true })
    expect(host.notify).toHaveBeenCalledWith({
      title: 'Hi',
      body: 'there',
      subtitle: undefined,
      silent: true,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/bun/mcp/app/tools.test.ts`
Expected: FAIL — cannot resolve `./tools`.

- [ ] **Step 3: Implement the tools**

Create `src/bun/mcp/app/tools.ts`:

```ts
import { z } from 'zod'
import type { McpTool } from '../types'
import { text, errorResult } from '../types'
import { getSnapshot, getHostActions, buildCommandJs, type HostActions } from './bridge'
import type { McpAppCommand } from '@/shared/lib/rpcContract'

const VIEWS = [
  'dashboard',
  'projects',
  'issues',
  'issue',
  'merge-requests',
  'merge-request',
  'pipelines',
] as const
const PROJECT_VIEWS = new Set(['issues', 'issue', 'merge-requests', 'merge-request', 'pipelines'])
const IID_VIEWS = new Set(['issue', 'merge-request'])

/** Host actions, or null → callers return a uniform error. Set at boot by src/bun/index.ts. */
function host(): HostActions | null {
  return getHostActions()
}
const NO_BRIDGE = errorResult('App-control bridge not initialized (app still booting?).')

export const appTools: McpTool[] = [
  {
    name: 'lumen_app_state',
    description:
      "What's on screen now: the main window's route/view/project, selected and visible issue iids, plus every open native window. Snapshot is null until the app reports once.",
    inputSchema: {},
    handler: async () => {
      const h = host()
      if (!h) return NO_BRIDGE
      return text({ snapshot: getSnapshot(), windows: h.listWindows() })
    },
  },
  {
    name: 'lumen_app_navigate',
    description:
      "Navigate the main window. view: dashboard | projects | issues | issue | merge-requests | merge-request | pipelines. project (path, e.g. 'group/repo') is required for project-scoped views; iid for issue/merge-request. Fire-and-forget: confirm via lumen_app_state.",
    inputSchema: {
      view: z.enum(VIEWS),
      project: z.string().optional(),
      iid: z.string().optional(),
    },
    handler: async (a) => {
      const h = host()
      if (!h) return NO_BRIDGE
      const view = a.view as (typeof VIEWS)[number]
      if (PROJECT_VIEWS.has(view) && !a.project)
        return errorResult(`view '${view}' requires 'project'`)
      if (IID_VIEWS.has(view) && !a.iid) return errorResult(`view '${view}' requires 'iid'`)
      const cmd: McpAppCommand = { cmd: 'navigate', view }
      if (a.project) cmd.project = a.project as string
      if (a.iid) cmd.iid = a.iid as string
      const res = h.driveMain(buildCommandJs(cmd))
      if (!res.ok) return text({ ok: false, note: 'main window not open' })
      return text({ ok: true, note: 'dispatched; confirm via lumen_app_state' })
    },
  },
  {
    name: 'lumen_app_open_issue',
    description:
      'Open a native single-issue window (or focus the existing one for that issue).',
    inputSchema: { project: z.string(), iid: z.string() },
    handler: async (a) => {
      const h = host()
      if (!h) return NO_BRIDGE
      return text(h.openIssueWindow({ fullPath: a.project as string, iid: a.iid as string }))
    },
  },
  {
    name: 'lumen_app_open_issues_window',
    description: 'Open a native multi-issue pager window over several issues of one project.',
    inputSchema: { project: z.string(), iids: z.array(z.string()).min(1) },
    handler: async (a) => {
      const h = host()
      if (!h) return NO_BRIDGE
      return text(h.openIssuesWindow({ fullPath: a.project as string, iids: a.iids as string[] }))
    },
  },
  {
    name: 'lumen_app_open_settings',
    description: 'Open (or focus) the native Settings window.',
    inputSchema: {},
    handler: async () => {
      const h = host()
      if (!h) return NO_BRIDGE
      return text(h.openSettingsWindow())
    },
  },
  {
    name: 'lumen_app_notify',
    description: 'Post a native desktop notification.',
    inputSchema: {
      title: z.string(),
      body: z.string().optional(),
      subtitle: z.string().optional(),
      silent: z.boolean().optional(),
    },
    handler: async (a) => {
      const h = host()
      if (!h) return NO_BRIDGE
      h.notify({
        title: a.title as string,
        body: a.body as string | undefined,
        subtitle: a.subtitle as string | undefined,
        silent: a.silent as boolean | undefined,
      })
      return text({ ok: true })
    },
  },
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/bun/mcp/app/tools.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/bun/mcp/app/tools.ts src/bun/mcp/app/tools.test.ts
git commit -m "feat(mcp): six lumen_app_* app-control tools"
```

---

### Task 4: Register the app tools

**Files:**
- Modify: `src/bun/mcp/registry.ts`
- Test: `src/bun/mcp/registry.test.ts`

- [ ] **Step 1: Extend the registry test (failing first)**

In `src/bun/mcp/registry.test.ts`, in the catalog test, add the six names to the
`expect.arrayContaining([...])` list:

```ts
      'lumen_app_state',
      'lumen_app_navigate',
      'lumen_app_open_issue',
      'lumen_app_open_issues_window',
      'lumen_app_open_settings',
      'lumen_app_notify',
```

and add a total-count assertion after the uniqueness check:

```ts
  expect(names).toHaveLength(20)
```

(If the test previously asserted a length of 14, update it to 20.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/mcp/registry.test.ts`
Expected: FAIL — missing `lumen_app_*` names.

- [ ] **Step 3: Register**

In `src/bun/mcp/registry.ts`:

```ts
import { appTools } from './app/tools'
```

and:

```ts
export const allTools: McpTool[] = [
  ...issueTools,
  ...mrTools,
  ...labelTools,
  ...userTools,
  ...appTools,
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/bun/mcp`
Expected: PASS (all MCP suites, including server integration tests).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/bun/mcp/registry.ts src/bun/mcp/registry.test.ts
git commit -m "feat(mcp): register app-control tools (20 total)"
```

---

### Task 5: Host wiring in `src/bun/index.ts`

**Files:**
- Modify: `src/bun/index.ts`

No unit test — `index.ts` is the untested entrypoint (existing convention); the
bridge/tool behavior is covered in Tasks 2–3 and the wiring is verified by the
bundle check below plus the Task 8 smoke test.

- [ ] **Step 1: Import the bridge**

Add to the imports in `src/bun/index.ts` (after the `./serverHealth` import block):

```ts
import { cacheSnapshot, setHostActions, type WindowInfo } from './mcp/app/bridge'
```

(Relative import — this is a value import inside `src/bun`.)

- [ ] **Step 2: Track combined issues-windows**

Below the `issueWindows` map declaration, add:

```ts
// Combined multi-issue windows are not deduped/focused, but the MCP app-state
// tool lists them, so track membership for counting.
const issuesWindows = new Set<BrowserWindow>()
```

In `openIssuesWindow`, replace `void issuesWin` with:

```ts
  issuesWindows.add(issuesWin)
  issuesWin.on('close', () => issuesWindows.delete(issuesWin))
```

- [ ] **Step 3: Add the `reportAppState` RPC handler**

In `buildRpc`'s `requests` object (after `notifyCacheCleared`):

```ts
        reportAppState: async (s) => {
          cacheSnapshot(s)
          return { ok: true }
        },
```

- [ ] **Step 4: Register host actions after the main window is created**

After the `const win = track(new BrowserWindow({...}))` block and **before**
`startMcpIfEnabled()`:

```ts
// Hand the MCP app-control tools their host capabilities. Injected (not
// imported from the tools) to keep mcp/app free of entrypoint imports.
setHostActions({
  openIssueWindow,
  openIssuesWindow,
  openSettingsWindow,
  notify: (a) => Utils.showNotification(a),
  driveMain: (js) => {
    if (!windows.has(win)) return { ok: false } // main window closed
    win.webview.executeJavascript(js)
    return { ok: true }
  },
  listWindows: (): WindowInfo[] => {
    const out: WindowInfo[] = []
    if (windows.has(win)) out.push({ kind: 'main' })
    for (const key of issueWindows.keys()) out.push({ kind: 'issue', key })
    for (const _ of issuesWindows) out.push({ kind: 'issues-window' })
    if (settingsWindow) out.push({ kind: 'settings' })
    return out
  },
})
```

- [ ] **Step 5: Verify the host bundle builds and tests pass**

Run: `bun build src/bun/index.ts --target=bun --outdir=/tmp/lumen-build-check && rm -rf /tmp/lumen-build-check && bunx vitest run src/bun`
Expected: bundle builds (no unresolved imports); all `src/bun` tests PASS.

- [ ] **Step 6: Format and commit**

```bash
bun run format
git add src/bun/index.ts
git commit -m "feat(mcp): wire app-control host actions + reportAppState handler"
```

---

### Task 6: Webview composable — report + command listener

**Files:**
- Create: `src/shared/composables/useAppStateReport.ts`
- Test: `src/shared/composables/useAppStateReport.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/composables/useAppStateReport.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import {
  installAppStateReport,
  setReportedIssueIids,
  clearReportedIssueIids,
  __resetAppStateReport,
} from './useAppStateReport'

const reportAppState = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/shared/lib/rpc', () => ({
  rpc: { reportAppState: (a: unknown) => reportAppState(a) },
}))

const Stub = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Stub },
      { path: '/projects', name: 'projects', component: Stub },
      { path: '/projects/:fullPath(.*)/issues', name: 'issues', component: Stub },
      { path: '/projects/:fullPath(.*)/issues/:iid', name: 'issue', component: Stub },
      { path: '/projects/:fullPath(.*)/merge-requests', name: 'merge-requests', component: Stub },
      { path: '/projects/:fullPath(.*)/merge-requests/:iid', name: 'merge-request', component: Stub },
      { path: '/projects/:fullPath(.*)/pipelines', name: 'pipelines', component: Stub },
    ],
  })
}

function dispatch(detail: unknown) {
  window.dispatchEvent(new CustomEvent('lumen:mcp-command', { detail }))
}

let router: Router

beforeEach(async () => {
  vi.useFakeTimers()
  reportAppState.mockClear()
  __resetAppStateReport()
  router = makeRouter()
  await router.push('/')
  installAppStateReport(router)
})

afterEach(() => {
  vi.useRealTimers()
  __resetAppStateReport()
})

describe('state reporting', () => {
  it('reports once after the debounce window', async () => {
    await vi.advanceTimersByTimeAsync(200)
    expect(reportAppState).toHaveBeenCalledTimes(1)
    expect(reportAppState).toHaveBeenCalledWith({
      route: '/',
      view: 'home',
      projectPath: null,
      selectedIssueIids: [],
      visibleIssueIids: [],
    })
  })

  it('coalesces a route change + iid change into one trailing report', async () => {
    await vi.advanceTimersByTimeAsync(200)
    reportAppState.mockClear()
    await router.push('/projects/a/b/issues')
    setReportedIssueIids(['3'], ['3', '4'])
    await vi.advanceTimersByTimeAsync(200)
    expect(reportAppState).toHaveBeenCalledTimes(1)
    expect(reportAppState).toHaveBeenCalledWith({
      route: '/projects/a/b/issues',
      view: 'issues',
      projectPath: 'a/b',
      selectedIssueIids: ['3'],
      visibleIssueIids: ['3', '4'],
    })
  })

  it('clearReportedIssueIids empties the iid arrays in the next report', async () => {
    setReportedIssueIids(['3'], ['3'])
    await vi.advanceTimersByTimeAsync(200)
    reportAppState.mockClear()
    clearReportedIssueIids()
    await vi.advanceTimersByTimeAsync(200)
    expect(reportAppState).toHaveBeenCalledWith(
      expect.objectContaining({ selectedIssueIids: [], visibleIssueIids: [] }),
    )
  })
})

describe('command listener', () => {
  it('navigates to a project-scoped view', async () => {
    dispatch({ cmd: 'navigate', view: 'issues', project: 'a/b' })
    await vi.runAllTimersAsync()
    expect(router.currentRoute.value.name).toBe('issues')
    expect(router.currentRoute.value.params.fullPath).toBe('a/b')
  })
  it('navigates to an issue detail with iid', async () => {
    dispatch({ cmd: 'navigate', view: 'issue', project: 'a/b', iid: '7' })
    await vi.runAllTimersAsync()
    expect(router.currentRoute.value.name).toBe('issue')
    expect(router.currentRoute.value.params.iid).toBe('7')
  })
  it('ignores unknown commands and unknown views', async () => {
    dispatch({ cmd: 'self-destruct' })
    dispatch({ cmd: 'navigate', view: 'settings' })
    dispatch(undefined)
    await vi.runAllTimersAsync()
    expect(router.currentRoute.value.name).toBe('home')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/shared/composables/useAppStateReport.test.ts`
Expected: FAIL — cannot resolve `./useAppStateReport`.

- [ ] **Step 3: Implement the composable**

Create `src/shared/composables/useAppStateReport.ts`:

```ts
import { ref, watch } from 'vue'
import type { Router } from 'vue-router'
import { rpc } from '@/shared/lib/rpc'
import type { AppStateSnapshot, McpAppCommand } from '@/shared/lib/rpcContract'

// Module singletons: IssueList pushes its selection/visible iids here; the
// installed watcher folds them into the next debounced snapshot report.
const selectedIids = ref<string[]>([])
const visibleIids = ref<string[]>([])

export function setReportedIssueIids(selected: string[], visible: string[]): void {
  selectedIids.value = selected
  visibleIids.value = visible
}

export function clearReportedIssueIids(): void {
  selectedIids.value = []
  visibleIids.value = []
}

// MCP navigate views → router route names. Internal routes (connect, settings,
// issues-window) are deliberately unreachable from agents.
const VIEW_TO_ROUTE: Record<string, string> = {
  dashboard: 'home',
  projects: 'projects',
  issues: 'issues',
  issue: 'issue',
  'merge-requests': 'merge-requests',
  'merge-request': 'merge-request',
  pipelines: 'pipelines',
}

const DEBOUNCE_MS = 150

let timer: ReturnType<typeof setTimeout> | null = null
let stopWatch: (() => void) | null = null
let commandListener: ((e: Event) => void) | null = null

/**
 * Main-window only (gated at the main.ts call site): report route/selection
 * state to the host (debounced trailing) and route lumen:mcp-command events
 * into vue-router. Never torn down in production — lives as long as the webview.
 */
export function installAppStateReport(router: Router): void {
  const push = () => {
    const r = router.currentRoute.value
    const snapshot: AppStateSnapshot = {
      route: r.path,
      view: String(r.name ?? ''),
      projectPath: typeof r.params.fullPath === 'string' ? r.params.fullPath : null,
      selectedIssueIids: [...selectedIids.value],
      visibleIssueIids: [...visibleIids.value],
    }
    // Best-effort: a report that races app teardown must not surface.
    void rpc.reportAppState(snapshot).catch(() => {})
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(push, DEBOUNCE_MS)
  }
  stopWatch = watch([router.currentRoute, selectedIids, visibleIids], schedule, {
    immediate: true,
  })

  commandListener = (e: Event) => {
    const detail = (e as CustomEvent).detail as McpAppCommand | undefined
    if (!detail || detail.cmd !== 'navigate') return
    const name = VIEW_TO_ROUTE[detail.view]
    if (!name) return
    const params: Record<string, string> = {}
    if (detail.project) params.fullPath = detail.project
    if (detail.iid) params.iid = detail.iid
    void router.push({ name, params }).catch(() => {}) // bad params: stay put
  }
  window.addEventListener('lumen:mcp-command', commandListener)
}

/** Test-only: uninstall and reset module state. */
export function __resetAppStateReport(): void {
  if (timer) clearTimeout(timer)
  timer = null
  stopWatch?.()
  stopWatch = null
  if (commandListener) window.removeEventListener('lumen:mcp-command', commandListener)
  commandListener = null
  selectedIids.value = []
  visibleIids.value = []
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/shared/composables/useAppStateReport.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/shared/composables/useAppStateReport.ts src/shared/composables/useAppStateReport.test.ts
git commit -m "feat(mcp): webview app-state reporter + mcp-command listener"
```

---

### Task 7: Wire into `main.ts` and `IssueList.vue`

**Files:**
- Modify: `src/main.ts`
- Modify: `src/views/IssueList.vue`

- [ ] **Step 1: Install in the main window only**

In `src/main.ts`, add the import:

```ts
import { installAppStateReport } from '@/shared/composables/useAppStateReport'
```

In `boot()`, after `installServerHealth(queryClient)` and before `createApp`:

```ts
  // MCP app-control: only the main window reports state / accepts drive
  // commands. Popouts and the settings window get a non-null initial route.
  if (!route) installAppStateReport(router)
```

- [ ] **Step 2: Push selection + visible iids from IssueList**

In `src/views/IssueList.vue`, add to the imports:

```ts
import {
  setReportedIssueIids,
  clearReportedIssueIids,
} from '@/shared/composables/useAppStateReport'
```

After the `loadedIids` computed (`const loadedIids = computed(...)`, around line 157), add:

```ts
// Mirror selection + loaded iids into the MCP app-state report (no-op when the
// MCP server is off — the report is a cheap cached push either way).
watch(
  [() => selection.selected.value, loadedIids],
  ([sel, iids]) => setReportedIssueIids([...sel], iids),
  { immediate: true },
)
onUnmounted(clearReportedIssueIids)
```

`watch` is already imported in this file; add `onUnmounted` to the existing `vue`
import if it isn't there.

- [ ] **Step 3: Run the full suite**

Run: `bunx vitest run`
Expected: PASS — all suites (the IssueList tests exercise the new watch; the
mocked rpc in test setup absorbs `reportAppState` calls — if a test fails with
"reportAppState is not a function", add `reportAppState: async () => ({ ok: true })`
to that test file's rpc mock).

- [ ] **Step 4: Format and commit**

```bash
bun run format
git add src/main.ts src/views/IssueList.vue
git commit -m "feat(mcp): main window reports app state; IssueList feeds selection iids"
```

---

### Task 8: Docs + end-to-end smoke test

**Files:**
- Modify: `docs/mcp-server.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update docs**

In `docs/mcp-server.md`: update the tool count (14 → 20) and add an
"App-control tools" section documenting the six tools, the main-window-only
drive rule, string iids, and the fire-and-forget + re-read-state pattern.
Follow the doc's existing table/format conventions.

In `CHANGELOG.md`: add an entry under the unreleased/latest section:

```md
- MCP app-control tools: `lumen_app_state`, `lumen_app_navigate`,
  `lumen_app_open_issue`, `lumen_app_open_issues_window`,
  `lumen_app_open_settings`, `lumen_app_notify` (20 tools total).
```

- [ ] **Step 2: Commit docs**

```bash
bun run format
git add docs/mcp-server.md CHANGELOG.md
git commit -m "docs(mcp): app-control tools"
```

- [ ] **Step 3: Manual smoke test (requires the app running)**

Ask the user to restart the app (`bun run app:dev` or `app:hmr`) with MCP
enabled, then (token from Settings ▸ Agent access):

```bash
TOKEN="<bearer token>"
HDR=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream')
# 1. 20 tools
curl -s "${HDR[@]}" -X POST http://127.0.0.1:7437/ -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o '"name"' | wc -l   # → 20
# 2. state (snapshot non-null after the app has been interacted with)
curl -s "${HDR[@]}" -X POST http://127.0.0.1:7437/ -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lumen_app_state","arguments":{}}}'
# 3. navigate the visible main window to the dashboard
curl -s "${HDR[@]}" -X POST http://127.0.0.1:7437/ -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lumen_app_navigate","arguments":{"view":"dashboard"}}}'
# 4. re-read state → view should now be "home"; then open an issue window and
#    confirm it appears in windows[].
```

Expected: tools/list shows 20; navigate visibly switches the main window;
`lumen_app_state` reflects each change; an opened issue window shows up as
`{ "kind": "issue", "key": "<project>#<iid>" }`.
