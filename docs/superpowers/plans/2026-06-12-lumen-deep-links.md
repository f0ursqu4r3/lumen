# Lumen `lumen://` Deep Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the `lumen://` URL scheme on macOS so opening a link focuses Lumen on an issue (as the list "sheet") or a filtered issues list.

**Architecture:** Three small units. (1) A pure, validated parser in `src/shared/lib/deepLink.ts` turns an untrusted `lumen://` string into a `DeepLinkIntent` and a router location — the trust boundary. (2) A host handler `src/bun/deepLinkHost.ts` receives Electrobun's `open-url`, reuses an open popout or forwards the location to the main webview, and buffers links that arrive before the main window is ready (cold start). (3) A webview installer `src/shared/composables/useDeepLinkRoute.ts` listens on a dedicated `lumen:deeplink` event and `router.push`es the location. The in-app target state is already URL-encoded (the sheet is `?issue=<iid>`, filters are existing query keys), so this is a translation feature, not new UI.

**Tech Stack:** TypeScript, Electrobun 1.18.1 (`urlSchemes` + `open-url` event), Vue Router, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-06-12-lumen-deep-links-design.md`

---

## File Structure

New:
- `src/shared/lib/issueFilterKeys.ts` — zero-dependency list of issues-list view query keys (host-safe).
- `src/shared/lib/issueFilterKeys.test.ts`
- `src/shared/lib/deepLink.ts` — pure parser `parseLumenUrl` + mapper `intentToLocation` (the trust boundary).
- `src/shared/lib/deepLink.test.ts`
- `src/bun/deepLinkHost.ts` — `createDeepLinkRouter` (popout reuse, forward, cold-start queue) + `buildDeepLinkJs`.
- `src/bun/deepLinkHost.test.ts`
- `src/shared/composables/useDeepLinkRoute.ts` — `installDeepLinkRoute(router)` (`lumen:deeplink` → `router.push`).
- `src/shared/composables/useDeepLinkRoute.test.ts`
- `docs/deep-links.md` — scheme, URL shapes, manual smoke test.

Modified:
- `src/features/issues/composables/useIssueFilters.ts` — source `FILTER_KEYS` from the new shared module, re-export for existing callers.
- `electrobun.config.ts` — `app.urlSchemes: ['lumen']`.
- `src/bun/index.ts` — create the deep-link router, wire `open-url`, mark ready from `reportAppState`.
- `src/main.ts` — `installDeepLinkRoute(router)` for the main window.

---

## Task 1: Extract `FILTER_KEYS` into a host-safe shared module

The parser (imported by the Bun host) must not transitively import Vue, and the host bundle does not resolve the `@/` alias. Move the constant to a zero-import module and re-export it from `useIssueFilters` so the four existing callers are unaffected.

**Files:**
- Create: `src/shared/lib/issueFilterKeys.ts`
- Create: `src/shared/lib/issueFilterKeys.test.ts`
- Modify: `src/features/issues/composables/useIssueFilters.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/lib/issueFilterKeys.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { FILTER_KEYS } from './issueFilterKeys'

describe('FILTER_KEYS', () => {
  it('lists the issues-list view keys in order', () => {
    expect(FILTER_KEYS).toEqual([
      'state',
      'label',
      'assignee',
      'author',
      'q',
      'sort',
      'group',
      'view',
      'scope',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/shared/lib/issueFilterKeys.test.ts`
Expected: FAIL — cannot find module `./issueFilterKeys`.

- [ ] **Step 3: Create the module**

Create `src/shared/lib/issueFilterKeys.ts`:

```typescript
/**
 * URL query keys that define the issues-list view (filters, sort, grouping). This is
 * the unit a "saved view" snapshots and what the filter auto-save mirrors.
 *
 * Lives in shared/lib with zero imports so the Bun host bundle — which does not resolve
 * the "@/" alias and must not pull in Vue — can import it via a relative path. The
 * lumen:// deep-link parser whitelists list-view params against this list.
 */
export const FILTER_KEYS = [
  'state',
  'label',
  'assignee',
  'author',
  'q',
  'sort',
  'group',
  'view',
  'scope',
] as const

export type FilterKey = (typeof FILTER_KEYS)[number]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/shared/lib/issueFilterKeys.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-export from `useIssueFilters` (no behavior change)**

In `src/features/issues/composables/useIssueFilters.ts`, add this import alongside the existing imports at the top (after the `import type { ViewSlice }` line):

```typescript
import { FILTER_KEYS } from '@/shared/lib/issueFilterKeys'
```

Then replace this block:

```typescript
// URL keys that make up the persisted, per-project view-state slice. This is
// the unit a "saved view" snapshots and what the auto-save mirrors.
export const FILTER_KEYS = [
  'state',
  'label',
  'assignee',
  'author',
  'q',
  'sort',
  'group',
  'view',
  'scope',
] as const
```

with:

```typescript
// The persisted, per-project view-state keys now live in a host-safe shared module
// (the deep-link parser needs them too); re-exported here for existing callers.
export { FILTER_KEYS }
```

- [ ] **Step 6: Verify nothing broke**

Run: `bunx vitest run src/features/issues src/features/palette`
Expected: PASS (callers `useIssueSavedViews`, `usePaletteCommands` still resolve `FILTER_KEYS`).

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "issueFilterKeys|useIssueFilters" || echo "clean"`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add src/shared/lib/issueFilterKeys.ts src/shared/lib/issueFilterKeys.test.ts src/features/issues/composables/useIssueFilters.ts
git commit -m "refactor(issues): extract FILTER_KEYS into a host-safe shared module"
```

---

## Task 2: The parser — `src/shared/lib/deepLink.ts`

Pure, never-throwing parser that is the trust boundary. Uses `new URL` (which collapses `..`), validates strictly, and collapses every failure to `{ kind: 'focus' }`.

**Files:**
- Create: `src/shared/lib/deepLink.ts`
- Create: `src/shared/lib/deepLink.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/lib/deepLink.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseLumenUrl, intentToLocation } from './deepLink'

describe('parseLumenUrl', () => {
  it('parses an issue link with a single-segment project', () => {
    expect(parseLumenUrl('lumen://issue/group/42')).toEqual({
      kind: 'issue',
      project: 'group',
      iid: '42',
    })
  })

  it('parses an issue link with a multi-segment project', () => {
    expect(parseLumenUrl('lumen://issue/group/sub/repo/42')).toEqual({
      kind: 'issue',
      project: 'group/sub/repo',
      iid: '42',
    })
  })

  it('focuses (not errors) when the iid is not numeric', () => {
    expect(parseLumenUrl('lumen://issue/group/repo/not-a-number')).toEqual({ kind: 'focus' })
  })

  it('focuses when an issue link has no project', () => {
    expect(parseLumenUrl('lumen://issue/42')).toEqual({ kind: 'focus' })
  })

  it('parses an issues list link, whitelisting filter keys and dropping unknowns', () => {
    expect(
      parseLumenUrl('lumen://issues/group/repo?state=opened&group=milestone&evil=1'),
    ).toEqual({
      kind: 'issues',
      project: 'group/repo',
      query: { state: 'opened', group: 'milestone' },
    })
  })

  it('keeps repeated filter values as an array', () => {
    expect(parseLumenUrl('lumen://issues/group/repo?label=bug&label=ui')).toEqual({
      kind: 'issues',
      project: 'group/repo',
      query: { label: ['bug', 'ui'] },
    })
  })

  it('drops over-long filter values and caps array length', () => {
    const long = 'x'.repeat(201)
    const many = Array.from({ length: 25 }, (_, i) => `label=l${i}`).join('&')
    const out = parseLumenUrl(`lumen://issues/group/repo?q=${long}&${many}`)
    expect(out).toEqual({
      kind: 'issues',
      project: 'group/repo',
      query: { label: Array.from({ length: 20 }, (_, i) => `l${i}`) },
    })
  })

  it('focuses when an issues link has no project', () => {
    expect(parseLumenUrl('lumen://issues')).toEqual({ kind: 'focus' })
  })

  it('focuses for bare lumen://, app/current, and unknown kinds', () => {
    expect(parseLumenUrl('lumen://')).toEqual({ kind: 'focus' })
    expect(parseLumenUrl('lumen://app/current')).toEqual({ kind: 'focus' })
    expect(parseLumenUrl('lumen://mr/group/repo/7')).toEqual({ kind: 'focus' })
  })

  it('focuses for a non-lumen scheme or garbage input', () => {
    expect(parseLumenUrl('https://example.com/issue/1')).toEqual({ kind: 'focus' })
    expect(parseLumenUrl('not a url')).toEqual({ kind: 'focus' })
  })

  it('cannot escape via .. — the URL parser normalizes it to a benign path', () => {
    // new URL collapses ../ before we validate, so traversal resolves to a plain link.
    expect(parseLumenUrl('lumen://issue/../../x/1')).toEqual({
      kind: 'issue',
      project: 'x',
      iid: '1',
    })
  })
})

describe('intentToLocation', () => {
  it('maps an issue intent to the list route with the drawer query', () => {
    expect(intentToLocation({ kind: 'issue', project: 'group/repo', iid: '42' })).toEqual({
      name: 'issues',
      params: { fullPath: 'group/repo' },
      query: { issue: '42' },
    })
  })

  it('maps an issues intent to the list route, passing filters through', () => {
    expect(
      intentToLocation({ kind: 'issues', project: 'group/repo', query: { state: 'opened' } }),
    ).toEqual({
      name: 'issues',
      params: { fullPath: 'group/repo' },
      query: { state: 'opened' },
    })
  })

  it('returns null for a focus intent', () => {
    expect(intentToLocation({ kind: 'focus' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/shared/lib/deepLink.test.ts`
Expected: FAIL — cannot find module `./deepLink`.

- [ ] **Step 3: Implement the parser**

Create `src/shared/lib/deepLink.ts`:

```typescript
import { FILTER_KEYS } from './issueFilterKeys'

/** A validated intent parsed from a lumen:// URL. `focus` means "just bring the app forward". */
export type DeepLinkIntent =
  | { kind: 'issue'; project: string; iid: string }
  | { kind: 'issues'; project: string; query: Record<string, string | string[]> }
  | { kind: 'focus' }

/** A vue-router location for the issues list route. */
export interface IssuesLocation {
  name: 'issues'
  params: { fullPath: string }
  query: Record<string, string | string[]>
}

const FOCUS: DeepLinkIntent = { kind: 'focus' }
const NUMERIC = /^\d+$/
const SEGMENT = /^[A-Za-z0-9._-]+$/
const FILTER_KEY_LIST: readonly string[] = FILTER_KEYS
const MAX_VALUE_LEN = 200
const MAX_ARRAY = 20

/** Join project path segments, or null if any segment is unsafe (charset / traversal). */
function cleanProject(segments: string[]): string | null {
  if (!segments.length) return null
  for (const s of segments) {
    if (!SEGMENT.test(s) || s === '.' || s === '..') return null
  }
  return segments.join('/')
}

/** Pick only known filter keys from the query, capping value length and array size. */
function pickFilters(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const key of FILTER_KEY_LIST) {
    const values = params
      .getAll(key)
      .filter((v) => v.length > 0 && v.length <= MAX_VALUE_LEN)
      .slice(0, MAX_ARRAY)
    if (!values.length) continue
    out[key] = values.length === 1 ? values[0] : values
  }
  return out
}

/**
 * Parse a lumen:// URL into a validated intent. Never throws: any malformed, unknown,
 * or unsafe input collapses to { kind: 'focus' }. This is the deep-link trust boundary.
 */
export function parseLumenUrl(raw: string): DeepLinkIntent {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return FOCUS
  }
  if (url.protocol !== 'lumen:') return FOCUS

  const kind = url.hostname
  const segments = url.pathname.split('/').filter(Boolean)

  if (kind === 'issue') {
    if (segments.length < 2) return FOCUS
    const iid = segments[segments.length - 1]
    if (!NUMERIC.test(iid)) return FOCUS
    const project = cleanProject(segments.slice(0, -1))
    if (!project) return FOCUS
    return { kind: 'issue', project, iid }
  }

  if (kind === 'issues') {
    const project = cleanProject(segments)
    if (!project) return FOCUS
    return { kind: 'issues', project, query: pickFilters(url.searchParams) }
  }

  return FOCUS
}

/** Map a parsed intent to the issues-list router location, or null for a focus intent. */
export function intentToLocation(intent: DeepLinkIntent): IssuesLocation | null {
  if (intent.kind === 'issue') {
    return { name: 'issues', params: { fullPath: intent.project }, query: { issue: intent.iid } }
  }
  if (intent.kind === 'issues') {
    return { name: 'issues', params: { fullPath: intent.project }, query: intent.query }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/shared/lib/deepLink.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/deepLink.ts src/shared/lib/deepLink.test.ts
git commit -m "feat(deep-links): pure lumen:// parser and route mapper"
```

---

## Task 3: The host router — `src/bun/deepLinkHost.ts`

Decides popout-reuse vs forward, and buffers links until the main window is ready. Dependency-injected host capabilities keep it testable without Electrobun.

**Files:**
- Create: `src/bun/deepLinkHost.ts`
- Create: `src/bun/deepLinkHost.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bun/deepLinkHost.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDeepLinkRouter, buildDeepLinkJs, type DeepLinkHost } from './deepLinkHost'

function stubHost(open: Set<string> = new Set()) {
  return {
    hasIssueWindow: vi.fn((key: string) => open.has(key)),
    focusIssueWindow: vi.fn(),
    focusMain: vi.fn(),
    driveMain: vi.fn(() => ({ ok: true })),
  } satisfies DeepLinkHost
}

describe('buildDeepLinkJs', () => {
  it('dispatches a lumen:deeplink CustomEvent with the JSON location', () => {
    const js = buildDeepLinkJs({ name: 'issues', params: { fullPath: 'g/r' }, query: { issue: '1' } })
    expect(js).toContain("lumen:deeplink")
    expect(js).toContain('"fullPath":"g/r"')
  })
})

describe('createDeepLinkRouter', () => {
  let host: ReturnType<typeof stubHost>
  beforeEach(() => {
    host = stubHost()
  })

  it('reuses an open popout for an issue link instead of routing the main window', () => {
    host = stubHost(new Set(['group/repo#42']))
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.handleOpenUrl('lumen://issue/group/repo/42')
    expect(host.focusIssueWindow).toHaveBeenCalledWith('group/repo#42')
    expect(host.driveMain).not.toHaveBeenCalled()
  })

  it('focuses main and forwards the location when no popout is open', () => {
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.handleOpenUrl('lumen://issue/group/repo/42')
    expect(host.focusMain).toHaveBeenCalled()
    expect(host.driveMain).toHaveBeenCalledTimes(1)
    expect(host.driveMain.mock.calls[0][0]).toContain('"issue":"42"')
  })

  it('forwards a filtered issues-list location', () => {
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.handleOpenUrl('lumen://issues/group/repo?state=opened')
    expect(host.driveMain.mock.calls[0][0]).toContain('"state":"opened"')
  })

  it('focuses main only for a focus intent (no route forwarded)', () => {
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.handleOpenUrl('lumen://app/current')
    expect(host.focusMain).toHaveBeenCalled()
    expect(host.driveMain).not.toHaveBeenCalled()
  })

  it('buffers links that arrive before ready, then flushes on markReady', () => {
    const router = createDeepLinkRouter(host)
    router.handleOpenUrl('lumen://issue/group/repo/42') // before ready
    expect(host.focusMain).not.toHaveBeenCalled()
    expect(host.driveMain).not.toHaveBeenCalled()
    router.markReady()
    expect(host.driveMain).toHaveBeenCalledTimes(1)
  })

  it('markReady is idempotent', () => {
    const router = createDeepLinkRouter(host)
    router.markReady()
    router.markReady()
    router.handleOpenUrl('lumen://issue/group/repo/42')
    expect(host.driveMain).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/deepLinkHost.test.ts`
Expected: FAIL — cannot find module `./deepLinkHost`.

- [ ] **Step 3: Implement the host router**

Create `src/bun/deepLinkHost.ts`:

```typescript
import { parseLumenUrl, intentToLocation } from '../shared/lib/deepLink'

/** Capabilities the deep-link router needs from the host, injected so this stays testable. */
export interface DeepLinkHost {
  /** Is a native popout window already open for this issue key (`${project}#${iid}`)? */
  hasIssueWindow: (key: string) => boolean
  /** Focus that popout window. */
  focusIssueWindow: (key: string) => void
  /** Bring the main window forward. */
  focusMain: () => void
  /** Run JS in the main window's webview; { ok: false } if it's gone. */
  driveMain: (js: string) => { ok: boolean }
}

/** Build the executeJavascript payload that dispatches a lumen:deeplink event in the webview. */
export function buildDeepLinkJs(location: unknown): string {
  return `window.dispatchEvent(new CustomEvent('lumen:deeplink',{detail:${JSON.stringify(location)}}))`
}

/**
 * Routes Electrobun open-url events. An issue link whose popout is already open focuses that
 * window; otherwise the main window is focused and the route forwarded to its webview. Links
 * that arrive before the main webview has mounted (cold launch) are buffered and replayed on
 * markReady (driven by the first reportAppState from the main window).
 */
export function createDeepLinkRouter(host: DeepLinkHost) {
  let mainReady = false
  const pending: string[] = []

  function dispatch(raw: string): void {
    const intent = parseLumenUrl(raw)
    if (intent.kind === 'issue' && host.hasIssueWindow(`${intent.project}#${intent.iid}`)) {
      host.focusIssueWindow(`${intent.project}#${intent.iid}`)
      return
    }
    host.focusMain()
    const location = intentToLocation(intent)
    if (location) host.driveMain(buildDeepLinkJs(location))
  }

  return {
    /** Handle an incoming open-url. Buffers until the main window is ready. */
    handleOpenUrl(raw: string): void {
      if (!mainReady) {
        pending.push(raw)
        return
      }
      dispatch(raw)
    },
    /** Mark the main webview mounted and replay any buffered links. Idempotent. */
    markReady(): void {
      if (mainReady) return
      mainReady = true
      for (const raw of pending.splice(0)) dispatch(raw)
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/bun/deepLinkHost.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/bun/deepLinkHost.ts src/bun/deepLinkHost.test.ts
git commit -m "feat(deep-links): host open-url router with popout reuse and cold-start queue"
```

---

## Task 4: The webview installer — `src/shared/composables/useDeepLinkRoute.ts`

Listens on the dedicated `lumen:deeplink` event and pushes the host-forwarded location. Install-once, with a test-only reset, mirroring `installAppStateReport`.

**Files:**
- Create: `src/shared/composables/useDeepLinkRoute.ts`
- Create: `src/shared/composables/useDeepLinkRoute.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/composables/useDeepLinkRoute.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Router } from 'vue-router'
import { installDeepLinkRoute, __resetDeepLinkRoute } from './useDeepLinkRoute'

function stubRouter() {
  return { push: vi.fn().mockResolvedValue(undefined) } as unknown as Router
}

afterEach(() => __resetDeepLinkRoute())

function emit(detail: unknown) {
  window.dispatchEvent(new CustomEvent('lumen:deeplink', { detail }))
}

describe('installDeepLinkRoute', () => {
  it('pushes the forwarded location onto the router', () => {
    const router = stubRouter()
    installDeepLinkRoute(router)
    const location = { name: 'issues', params: { fullPath: 'g/r' }, query: { issue: '42' } }
    emit(location)
    expect(router.push).toHaveBeenCalledWith(location)
  })

  it('ignores a non-object detail', () => {
    const router = stubRouter()
    installDeepLinkRoute(router)
    emit('nope')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('stops listening after reset', () => {
    const router = stubRouter()
    installDeepLinkRoute(router)
    __resetDeepLinkRoute()
    emit({ name: 'issues', params: { fullPath: 'g/r' }, query: {} })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('installs once (a second call does not double-fire)', () => {
    const router = stubRouter()
    installDeepLinkRoute(router)
    installDeepLinkRoute(router)
    emit({ name: 'issues', params: { fullPath: 'g/r' }, query: {} })
    expect(router.push).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/shared/composables/useDeepLinkRoute.test.ts`
Expected: FAIL — cannot find module `./useDeepLinkRoute`.

- [ ] **Step 3: Implement the installer**

Create `src/shared/composables/useDeepLinkRoute.ts`:

```typescript
import type { Router } from 'vue-router'

let listener: ((e: Event) => void) | null = null

/**
 * Main-window only (gated at the main.ts call site): route host-forwarded lumen:deeplink
 * locations into vue-router. A dedicated channel, separate from the MCP lumen:mcp-command
 * bridge. Install-once; never torn down in production.
 */
export function installDeepLinkRoute(router: Router): void {
  if (listener) return
  listener = (e: Event) => {
    const location = (e as CustomEvent).detail
    if (!location || typeof location !== 'object') return
    void router.push(location).catch(() => {}) // bad route: stay put
  }
  window.addEventListener('lumen:deeplink', listener)
}

/** Test-only: uninstall and reset module state. */
export function __resetDeepLinkRoute(): void {
  if (listener) window.removeEventListener('lumen:deeplink', listener)
  listener = null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/shared/composables/useDeepLinkRoute.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/shared/composables/useDeepLinkRoute.ts src/shared/composables/useDeepLinkRoute.test.ts
git commit -m "feat(deep-links): webview lumen:deeplink router installer"
```

---

## Task 5: Wiring — scheme registration, host event, webview install

Glue. No new unit test (integration of already-tested units); verified by typecheck + full suite + a documented manual smoke test.

**Files:**
- Modify: `electrobun.config.ts`
- Modify: `src/bun/index.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Register the URL scheme**

In `electrobun.config.ts`, change the `app` line:

```typescript
  app: { name: "Lumen", identifier: "com.kdougan.lumen", version: "0.1.0" },
```

to:

```typescript
  app: {
    name: "Lumen",
    identifier: "com.kdougan.lumen",
    version: "0.1.0",
    // Registers the lumen:// scheme on macOS (requires the app be in /Applications).
    urlSchemes: ["lumen"],
  },
```

- [ ] **Step 2: Wire the host open-url handler in `src/bun/index.ts`**

Add the import next to the other `./mcp` / local imports near the top:

```typescript
import { createDeepLinkRouter } from './deepLinkHost'
```

Immediately after the `setHostActions({ ... })` block (the call that ends around line 375, before `startMcpIfEnabled()`), insert:

```typescript
// Route lumen:// deep links: focus an already-open issue popout, else focus the main
// window and forward the route to its webview. Links that arrive before the main webview
// mounts (cold launch) are buffered and replayed on the first reportAppState (markReady).
const deepLink = createDeepLinkRouter({
  hasIssueWindow: (key) => issueWindows.has(key),
  focusIssueWindow: (key) => issueWindows.get(key)?.activate(),
  focusMain: () => {
    if (windows.has(win)) win.activate()
  },
  driveMain: (js) => {
    if (!windows.has(win)) return { ok: false }
    win.webview.executeJavascript(js)
    return { ok: true }
  },
})
Electrobun.events.on('open-url', (e) => {
  deepLink.handleOpenUrl((e as { data: { url: string } }).data.url)
})
```

Then, in the `reportAppState` RPC handler inside `buildRpc` (the `if (opts.isMain) { ... }` branch), add `deepLink.markReady()` so it becomes:

```typescript
        reportAppState: async (s) => {
          // Only the main window reports; cache for MCP and fold the route into
          // the session model so a restored launch reopens on the same view.
          if (opts.isMain) {
            cacheSnapshot(s)
            setMainRoute(s.route, s.view)
            deepLink.markReady() // first report = main webview mounted; flush buffered links
          }
          return { ok: true }
        },
```

Note: `deepLink` is referenced inside `buildRpc` but declared after it — same closure pattern the file already uses for `win` (referenced in `buildRpc`'s `clearConfig`/`notifyCacheCleared`, declared later). It is initialized during module init, long before any `reportAppState` call.

- [ ] **Step 3: Install the webview listener in `src/main.ts`**

Add the import next to the other composable imports near the top:

```typescript
import { installDeepLinkRoute } from '@/shared/composables/useDeepLinkRoute'
```

Change the main-window gate from:

```typescript
  if (isMain) installAppStateReport(router)
```

to:

```typescript
  if (isMain) {
    installAppStateReport(router)
    installDeepLinkRoute(router)
  }
```

- [ ] **Step 4: Verify typecheck and the full suite**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "deepLink|index\.ts|main\.ts|electrobun" || echo "clean"`
Expected: `clean`.

Run: `bunx vitest run`
Expected: PASS (whole suite green, including the four new test files).

- [ ] **Step 5: Format, then revert any unrelated reformats**

Run: `bun run format`
Then restore any files the formatter touched that this task did not change:
Run: `git checkout -- $(git diff --name-only | grep -vE "deepLink|issueFilterKeys|useIssueFilters|electrobun.config.ts|src/bun/index.ts|src/main.ts|useDeepLinkRoute" || true)`
Run: `git status --short` and confirm only this task's files remain modified.

- [ ] **Step 6: Commit**

```bash
git add electrobun.config.ts src/bun/index.ts src/main.ts
git commit -m "feat(deep-links): register lumen:// scheme and wire open-url to the router"
```

---

## Task 6: Documentation + manual verification

**Files:**
- Create: `docs/deep-links.md`

- [ ] **Step 1: Write the doc**

Create `docs/deep-links.md`:

```markdown
# Deep links (`lumen://`)

Lumen registers the `lumen://` URL scheme on macOS so links open the app and route it to
an issue or a filtered issues list. The scheme matches the MCP resource URIs, so the same
string an agent reads as a resource can also be opened by a human.

## URL shapes (v1: issues)

| URL | Effect |
| --- | --- |
| `lumen://issue/<project>/<iid>` | Focus Lumen; open issue `<iid>` as the sheet over the issues list. If a popout window for that issue is already open, focus it instead. |
| `lumen://issues/<project>?<filters>` | Focus Lumen; show the issues list for `<project>` with filters/grouping applied. Allowed query keys: `state, label, assignee, author, q, sort, group, view, scope` (others are ignored). |
| `lumen://` · anything invalid | Just focus the app. |

`<project>` is a full GitLab path and may contain slashes (`group/sub/repo`).

Merge requests (`lumen://mr/...`) are not handled yet.

## Notes

- macOS only. Electrobun registers the scheme **only when the app runs from `/Applications`** —
  dev builds (`bun run app:dev`) never receive `open-url`.
- Deep links only navigate; they can never mutate data. Unknown or malformed links are inert.

## Manual smoke test

On an installed build (drag `Lumen.app` to `/Applications`, launch once), with a project open:

```bash
open 'lumen://issue/<group>/<repo>/<iid>'    # opens the issue sheet over the list
open 'lumen://issues/<group>/<repo>?state=opened&label=bug'   # filtered list
open 'lumen://'                               # just focuses the app
```

Cold start: quit Lumen, then run an `open 'lumen://issue/...'` — the app launches and lands
on the issue once the main window finishes loading.
```

- [ ] **Step 2: Commit**

```bash
git add docs/deep-links.md
git commit -m "docs(deep-links): document the lumen:// scheme and manual smoke test"
```

- [ ] **Step 3: Manual verification (requires an installed build)**

This is the only step that exercises the real OS round-trip (Vitest covers all logic; Electrobun won't register the scheme for dev builds):

1. `bun run build` (or `bun run dist`), then drag the built `Lumen.app` into `/Applications` and launch it once so macOS registers the scheme.
2. Connect to GitLab and open a project.
3. Run each `open '...'` command from `docs/deep-links.md` and confirm: the issue sheet opens over the list; the filtered list applies; an already-open issue popout is focused rather than re-routed; a cold-start link launches and lands correctly.

Note any deviation as a follow-up task; do not mark the plan complete until the smoke test passes.

---

## Self-Review Notes

- **Spec coverage:** issue→sheet (`?issue=`) Task 2+5; issues→filters Task 2; popout reuse Task 3; cold-start queue Task 3; scheme registration Task 5; dedicated `lumen:deeplink` channel Task 3/4; validation/threat-model Task 2; testing strategy Tasks 1–4 + Task 6 manual. Non-goal (MRs) documented in Task 6.
- **Host-safety:** `deepLink.ts` imports only `./issueFilterKeys` (relative, zero-dep) — no Vue, no `@/`, safe for the Bun host bundle. Verified `FILTER_KEYS` extraction (Task 1) keeps the four existing callers working via re-export.
- **Type consistency:** `DeepLinkIntent`, `IssuesLocation`, `DeepLinkHost`, `createDeepLinkRouter`, `buildDeepLinkJs`, `parseLumenUrl`, `intentToLocation`, `installDeepLinkRoute`, `__resetDeepLinkRoute` are used with identical names/signatures across tasks.
```
