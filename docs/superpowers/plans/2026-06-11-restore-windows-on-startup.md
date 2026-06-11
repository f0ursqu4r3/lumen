# Restore Windows & State on Startup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-on "Restore windows on startup" setting that reopens the main window (size, position, in-app route) and the issue/combined-issues popouts (each at its remembered size/position) on launch; the settings window always opens centered on the current display.

**Architecture:** A new host module persists a live in-memory session model to `session.json` (separate from the `0o600` credential file), updated debounced as windows move/resize/open/close. The `restoreOnStartup` preference lives in `config.json`. Pure helpers (`planRestore`, `centerOn`) make gating and centering unit-testable; `src/bun/index.ts` is thin wiring. The main-vs-popout window identity (today keyed on `initialRoute === null`) is refactored to an explicit `isMain` flag so the main window can carry a restored route.

**Tech Stack:** Bun + Electrobun host (TypeScript), Vue 3 + vite renderer, Vitest. Tests run with `bunx vitest run` (NOT `bun test`). Run `bun run format` after edits.

---

## File Structure

**New files:**
- `src/bun/session.ts` — in-memory `SessionState` model + debounced persistence to `session.json`.
- `src/bun/session.test.ts` — model mutators, round-trip, corrupt-file fallback.
- `src/bun/restore.ts` — pure `planRestore()` gating (enabled × connected × safe-route).
- `src/bun/restore.test.ts` — gating matrix + safe-route filtering.
- `src/bun/display.ts` — pure `centerOn()` geometry helper.
- `src/bun/display.test.ts` — display pick + centering + fallbacks.
- `src/features/settings/panes/GeneralPane.vue` — the toggle UI.
- `src/features/settings/panes/GeneralPane.test.ts` — pane mounts, reads/writes pref.

**Modified files:**
- `src/bun/config.ts` — add `restoreOnStartup` to `AppConfig` + `saveRestoreOnStartup`.
- `src/bun/config.test.ts` — defaults + setter preservation.
- `src/shared/lib/rpcContract.ts` — `getInitialRoute` shape + two new requests.
- `src/shared/lib/rpc.ts` — client passthroughs.
- `src/bun/index.ts` — geometry capture, popout registration, frame override, centered settings, boot restore, `isMain` wiring, new handlers.
- `src/main.ts` — gate `installAppStateReport` on `isMain`.
- `src/features/settings/useSettingsNav.ts` — insert General pane first.
- `src/features/settings/useSettingsNav.test.ts` — updated order assertion.

---

## Task 1: Session model module (`session.ts`)

**Files:**
- Create: `src/bun/session.ts`
- Test: `src/bun/session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bun/session.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadSession,
  sessionSnapshot,
  saveSessionNow,
  initMain,
  setMainSize,
  setMainPosition,
  setMainRoute,
  registerPopout,
  setPopoutSize,
  setPopoutPosition,
  removePopout,
  clearPopouts,
  __resetSessionForTest,
} from './session'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lumen-sess-'))
  process.env.LUMEN_CONFIG_DIR = dir
  __resetSessionForTest()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.LUMEN_CONFIG_DIR
})

describe('session', () => {
  it('starts empty when no file exists', () => {
    expect(loadSession()).toEqual({
      main: { frame: null, route: null, view: null },
      popouts: [],
    })
  })

  it('round-trips the main window frame and route', () => {
    initMain({ x: 10, y: 20, width: 800, height: 600 }, '/issues', 'issues')
    saveSessionNow()
    __resetSessionForTest()
    expect(loadSession().main).toEqual({
      frame: { x: 10, y: 20, width: 800, height: 600 },
      route: '/issues',
      view: 'issues',
    })
  })

  it('merges main move (x/y) and resize (x/y/w/h)', () => {
    initMain({ x: 0, y: 0, width: 800, height: 600 }, null, null)
    setMainPosition(50, 60)
    expect(sessionSnapshot().main.frame).toEqual({ x: 50, y: 60, width: 800, height: 600 })
    setMainSize(70, 80, 900, 700)
    expect(sessionSnapshot().main.frame).toEqual({ x: 70, y: 80, width: 900, height: 700 })
  })

  it('upserts, updates, and removes popouts by id', () => {
    registerPopout({ id: 'a/b#3', kind: 'issue', fullPath: 'a/b', iid: '3', frame: { x: 1, y: 2, width: 720, height: 900 } })
    registerPopout({ id: 'issues:1', kind: 'issues', fullPath: 'a/b', iids: ['3', '4'], frame: { x: 5, y: 6, width: 760, height: 920 } })
    setPopoutPosition('a/b#3', 11, 12)
    setPopoutSize('issues:1', 7, 8, 765, 925)
    const popouts = sessionSnapshot().popouts
    expect(popouts).toHaveLength(2)
    expect(popouts.find((p) => p.id === 'a/b#3')!.frame).toEqual({ x: 11, y: 12, width: 720, height: 900 })
    expect(popouts.find((p) => p.id === 'issues:1')!.frame).toEqual({ x: 7, y: 8, width: 765, height: 925 })
    removePopout('a/b#3')
    expect(sessionSnapshot().popouts.map((p) => p.id)).toEqual(['issues:1'])
  })

  it('re-registering the same id replaces rather than duplicates', () => {
    registerPopout({ id: 'a/b#3', kind: 'issue', fullPath: 'a/b', iid: '3', frame: { x: 1, y: 2, width: 720, height: 900 } })
    registerPopout({ id: 'a/b#3', kind: 'issue', fullPath: 'a/b', iid: '3', frame: { x: 9, y: 9, width: 720, height: 900 } })
    expect(sessionSnapshot().popouts).toHaveLength(1)
    expect(sessionSnapshot().popouts[0].frame.x).toBe(9)
  })

  it('updates main route via setMainRoute', () => {
    initMain({ x: 0, y: 0, width: 800, height: 600 }, null, null)
    setMainRoute('/projects/a/b/issues', 'issues')
    expect(sessionSnapshot().main).toMatchObject({ route: '/projects/a/b/issues', view: 'issues' })
  })

  it('clearPopouts empties the popout list but keeps main', () => {
    initMain({ x: 0, y: 0, width: 800, height: 600 }, '/issues', 'issues')
    registerPopout({ id: 'a/b#3', kind: 'issue', fullPath: 'a/b', iid: '3', frame: { x: 1, y: 2, width: 720, height: 900 } })
    clearPopouts()
    const snap = sessionSnapshot()
    expect(snap.popouts).toEqual([])
    expect(snap.main.route).toBe('/issues')
  })

  it('falls back to empty on a corrupt file', () => {
    initMain({ x: 1, y: 1, width: 1, height: 1 }, null, null)
    saveSessionNow()
    const { writeFileSync } = require('node:fs')
    writeFileSync(join(dir, 'session.json'), '{ not json')
    __resetSessionForTest()
    expect(loadSession()).toEqual({ main: { frame: null, route: null, view: null }, popouts: [] })
  })

  it('saveSessionNow writes session.json into the config dir', () => {
    initMain({ x: 3, y: 4, width: 5, height: 6 }, null, null)
    saveSessionNow()
    expect(existsSync(join(dir, 'session.json'))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')).main.frame).toEqual({ x: 3, y: 4, width: 5, height: 6 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Write `src/bun/session.ts`**

```ts
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { configDir } from './config'

export interface Frame {
  x: number
  y: number
  width: number
  height: number
}

export interface MainSession {
  frame: Frame | null
  route: string | null // last reported main route path, e.g. /projects/a/b/issues
  view: string | null // route name, e.g. 'issues' (used for the safe-route gate)
}

export type PopoutSession =
  | { id: string; kind: 'issue'; fullPath: string; iid: string; frame: Frame }
  | { id: string; kind: 'issues'; fullPath: string; iids: string[]; frame: Frame }

export interface SessionState {
  main: MainSession
  popouts: PopoutSession[]
}

const EMPTY: SessionState = { main: { frame: null, route: null, view: null }, popouts: [] }
const sessionPath = () => join(configDir(), 'session.json')
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

// Module singleton: the live session model. Mutators update it and schedule a
// debounced write; the settings window is never registered here by construction.
let state: SessionState = clone(EMPTY)
let timer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 300

/** Read + parse session.json into the singleton; empty on miss or corruption. */
export function loadSession(): SessionState {
  const path = sessionPath()
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<SessionState>
      state = {
        main: {
          frame: raw.main?.frame ?? null,
          route: raw.main?.route ?? null,
          view: raw.main?.view ?? null,
        },
        popouts: Array.isArray(raw.popouts) ? raw.popouts : [],
      }
    } catch {
      state = clone(EMPTY)
    }
  } else {
    state = clone(EMPTY)
  }
  return sessionSnapshot()
}

export function sessionSnapshot(): SessionState {
  return clone(state)
}

/** Synchronous write of the current model; also cancels any pending debounce. */
export function saveSessionNow(): void {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(sessionPath(), JSON.stringify(state, null, 2))
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function scheduleSave(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(saveSessionNow, DEBOUNCE_MS)
}

/** Seed the main window's opening frame/route so later move/resize merges have a base. */
export function initMain(frame: Frame, route: string | null, view: string | null): void {
  state.main = { frame, route, view }
  scheduleSave()
}

export function setMainPosition(x: number, y: number): void {
  if (!state.main.frame) state.main.frame = { x, y, width: 0, height: 0 }
  else {
    state.main.frame.x = x
    state.main.frame.y = y
  }
  scheduleSave()
}

export function setMainSize(x: number, y: number, width: number, height: number): void {
  state.main.frame = { x, y, width, height }
  scheduleSave()
}

export function setMainRoute(route: string, view: string): void {
  state.main.route = route
  state.main.view = view
  scheduleSave()
}

export function registerPopout(entry: PopoutSession): void {
  const i = state.popouts.findIndex((p) => p.id === entry.id)
  if (i >= 0) state.popouts[i] = entry
  else state.popouts.push(entry)
  scheduleSave()
}

export function setPopoutPosition(id: string, x: number, y: number): void {
  const p = state.popouts.find((p) => p.id === id)
  if (!p) return
  p.frame.x = x
  p.frame.y = y
  scheduleSave()
}

export function setPopoutSize(id: string, x: number, y: number, width: number, height: number): void {
  const p = state.popouts.find((p) => p.id === id)
  if (!p) return
  p.frame = { x, y, width, height }
  scheduleSave()
}

export function removePopout(id: string): void {
  state.popouts = state.popouts.filter((p) => p.id !== id)
  scheduleSave()
}

/** Drop all popout entries so the model reflects only what is actually open.
 *  Called once at boot after loadSession so a restore-off (or partial) launch
 *  doesn't re-persist last session's stale popout list. */
export function clearPopouts(): void {
  state.popouts = []
  scheduleSave()
}

/** Test-only: reset the singleton and cancel any pending write. */
export function __resetSessionForTest(): void {
  state = clone(EMPTY)
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/bun/session.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Format & commit**

```bash
bun run format
git add src/bun/session.ts src/bun/session.test.ts
git commit -m "feat(session): in-memory window/session model with debounced persistence"
```

---

## Task 2: `restoreOnStartup` preference in config

**Files:**
- Modify: `src/bun/config.ts`
- Test: `src/bun/config.test.ts`

- [ ] **Step 1: Write the failing test**

Append these tests inside the `describe('config', ...)` block in `src/bun/config.test.ts` (and add `saveRestoreOnStartup` to the import on line 5):

```ts
  it('defaults restoreOnStartup to true when absent', () => {
    expect(loadConfig().restoreOnStartup).toBe(true)
  })

  it('persists restoreOnStartup and preserves url/token/mcp', () => {
    saveConfig({ url: 'https://gl.example.com', token: 'glpat-x' })
    saveRestoreOnStartup(false)
    const c = loadConfig()
    expect(c.restoreOnStartup).toBe(false)
    expect(c.gitlabUrl).toBe('https://gl.example.com')
    expect(c.token).toBe('glpat-x')
  })

  it('saveConfig preserves an existing restoreOnStartup=false', () => {
    saveConfig({ url: 'https://gl.example.com', token: 'glpat-x' })
    saveRestoreOnStartup(false)
    saveConfig({ url: 'https://gl2.example.com', token: 'glpat-y' })
    expect(loadConfig().restoreOnStartup).toBe(false)
  })
```

Also update the two existing `toEqual` assertions that spell out the full config object (the "reports unconfigured" and "imports from env" tests) to include `restoreOnStartup: true`:

```ts
  it('reports unconfigured when no file and no env', () => {
    expect(loadConfig()).toEqual({ gitlabUrl: null, token: null, mcp: null, restoreOnStartup: true })
  })
```
```ts
    expect(loadConfig()).toEqual({
      gitlabUrl: 'https://gl.example.com',
      token: 'glpat-abc',
      mcp: null,
      restoreOnStartup: true,
    })
```

Find any other `toEqual({ gitlabUrl... })` assertions in this file and add `restoreOnStartup: true` to each (the round-trip test on line ~38 included). Run the suite in Step 2 to surface every one.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/config.test.ts`
Expected: FAIL — `saveRestoreOnStartup` is not exported; `restoreOnStartup` missing from results.

- [ ] **Step 3: Edit `src/bun/config.ts`**

Add the field to the interface:

```ts
export interface AppConfig {
  gitlabUrl: string | null
  token: string | null
  mcp: McpConfig | null
  restoreOnStartup: boolean
}
```

In `loadConfig`, the file branch:

```ts
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppConfig>
    return {
      gitlabUrl: raw.gitlabUrl ? trimSlash(raw.gitlabUrl) : null,
      token: raw.token ?? null,
      mcp: raw.mcp ?? null,
      restoreOnStartup: raw.restoreOnStartup ?? true,
    }
  }
```

The env branch and the final return:

```ts
  if (envUrl && envToken)
    return { gitlabUrl: trimSlash(envUrl), token: envToken, mcp: null, restoreOnStartup: true }
  return { gitlabUrl: null, token: null, mcp: null, restoreOnStartup: true }
```

Update `saveConfig` and `saveMcpConfig` to carry the field through `persist`:

```ts
export function saveConfig(input: { url: string; token?: string }): void {
  const current = loadConfig()
  const token = input.token ?? current.token
  if (!token) throw new Error('GitLab token is required')
  persist({
    gitlabUrl: trimSlash(input.url),
    token,
    mcp: current.mcp,
    restoreOnStartup: current.restoreOnStartup,
  })
}

export function saveMcpConfig(mcp: McpConfig): void {
  const current = loadConfig()
  persist({
    gitlabUrl: current.gitlabUrl,
    token: current.token,
    mcp,
    restoreOnStartup: current.restoreOnStartup,
  })
}

export function saveRestoreOnStartup(enabled: boolean): void {
  const current = loadConfig()
  persist({
    gitlabUrl: current.gitlabUrl,
    token: current.token,
    mcp: current.mcp,
    restoreOnStartup: enabled,
  })
}
```

(`persist` already accepts a full `AppConfig`; no change to its body.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/bun/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Format & commit**

```bash
bun run format
git add src/bun/config.ts src/bun/config.test.ts
git commit -m "feat(config): restoreOnStartup preference (default on)"
```

---

## Task 3: Restore decision (`restore.ts`)

**Files:**
- Create: `src/bun/restore.ts`
- Test: `src/bun/restore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bun/restore.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planRestore } from './restore'
import type { SessionState } from './session'

const session = (over: Partial<SessionState['main']> = {}, popouts: SessionState['popouts'] = []): SessionState => ({
  main: { frame: { x: 1, y: 2, width: 800, height: 600 }, route: '/issues', view: 'issues', ...over },
  popouts,
})

describe('planRestore', () => {
  it('returns an empty plan when disabled', () => {
    expect(planRestore({ enabled: false, connected: true, session: session() })).toEqual({
      mainFrame: null,
      mainRoute: null,
      mainView: null,
      popouts: [],
    })
  })

  it('returns an empty plan when not connected', () => {
    expect(planRestore({ enabled: true, connected: false, session: session() })).toEqual({
      mainFrame: null,
      mainRoute: null,
      mainView: null,
      popouts: [],
    })
  })

  it('restores frame, route, and popouts when enabled and connected', () => {
    const popouts: SessionState['popouts'] = [
      { id: 'a/b#3', kind: 'issue', fullPath: 'a/b', iid: '3', frame: { x: 5, y: 6, width: 720, height: 900 } },
    ]
    expect(planRestore({ enabled: true, connected: true, session: session({}, popouts) })).toEqual({
      mainFrame: { x: 1, y: 2, width: 800, height: 600 },
      mainRoute: '/issues',
      mainView: 'issues',
      popouts,
    })
  })

  it('drops an unsafe main route but keeps the frame and popouts', () => {
    const plan = planRestore({
      enabled: true,
      connected: true,
      session: session({ route: '/settings', view: 'settings' }),
    })
    expect(plan.mainRoute).toBeNull()
    expect(plan.mainView).toBeNull()
    expect(plan.mainFrame).toEqual({ x: 1, y: 2, width: 800, height: 600 })
  })

  it('treats a null view as unsafe', () => {
    const plan = planRestore({ enabled: true, connected: true, session: session({ route: null, view: null }) })
    expect(plan.mainRoute).toBeNull()
  })

  it('allows each safe view', () => {
    for (const view of ['home', 'projects', 'issues', 'issue', 'merge-requests', 'merge-request', 'pipelines']) {
      const plan = planRestore({ enabled: true, connected: true, session: session({ route: `/${view}`, view }) })
      expect(plan.mainView).toBe(view)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/restore.test.ts`
Expected: FAIL — cannot find module `./restore`.

- [ ] **Step 3: Write `src/bun/restore.ts`**

```ts
import type { Frame, PopoutSession, SessionState } from './session'

// Routes the main window is allowed to restore into. Mirrors the agent-navigable
// view set in src/shared/composables/useAppStateReport.ts (VIEW_TO_ROUTE values):
// internal routes (connect, settings, issues-window) are deliberately excluded so
// a restored launch never lands on chrome the user can't otherwise reach directly.
const SAFE_VIEWS = new Set([
  'home',
  'projects',
  'issues',
  'issue',
  'merge-requests',
  'merge-request',
  'pipelines',
])

export interface RestorePlan {
  mainFrame: Frame | null
  mainRoute: string | null
  mainView: string | null
  popouts: PopoutSession[]
}

/** Decide what to restore. Off / not-connected ⇒ clean launch (everything null). */
export function planRestore(args: {
  enabled: boolean
  connected: boolean
  session: SessionState
}): RestorePlan {
  if (!args.enabled || !args.connected) {
    return { mainFrame: null, mainRoute: null, mainView: null, popouts: [] }
  }
  const { main, popouts } = args.session
  const safe = main.view != null && SAFE_VIEWS.has(main.view)
  return {
    mainFrame: main.frame,
    mainRoute: safe ? main.route : null,
    mainView: safe ? main.view : null,
    popouts,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/bun/restore.test.ts`
Expected: PASS.

- [ ] **Step 5: Format & commit**

```bash
bun run format
git add src/bun/restore.ts src/bun/restore.test.ts
git commit -m "feat(restore): pure planRestore gating with safe-route allowlist"
```

---

## Task 4: Display centering (`display.ts`)

**Files:**
- Create: `src/bun/display.ts`
- Test: `src/bun/display.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bun/display.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { centerOn, type Display } from './display'

const primary: Display = {
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 25, width: 1440, height: 875 },
  isPrimary: true,
}
const secondary: Display = {
  bounds: { x: 1440, y: 0, width: 1000, height: 800 },
  workArea: { x: 1440, y: 0, width: 1000, height: 800 },
  isPrimary: false,
}

describe('centerOn', () => {
  it('centers within the work area of the display containing the anchor', () => {
    const f = centerOn({ width: 820, height: 600 }, [primary, secondary], { x: 1940, y: 400 })
    // secondary workArea: x 1440..2440, y 0..800
    expect(f).toEqual({
      x: 1440 + Math.round((1000 - 820) / 2),
      y: 0 + Math.round((800 - 600) / 2),
      width: 820,
      height: 600,
    })
  })

  it('falls back to the primary display when the anchor is null', () => {
    const f = centerOn({ width: 820, height: 600 }, [primary, secondary], null)
    expect(f.x).toBe(Math.round((1440 - 820) / 2))
    expect(f.y).toBe(25 + Math.round((875 - 600) / 2))
  })

  it('falls back to primary when the anchor is off every display', () => {
    const f = centerOn({ width: 820, height: 600 }, [primary, secondary], { x: 9999, y: 9999 })
    expect(f.x).toBe(Math.round((1440 - 820) / 2))
  })

  it('clamps origin to the work area when the window is larger than the display', () => {
    const f = centerOn({ width: 2000, height: 600 }, [primary], { x: 10, y: 10 })
    expect(f.x).toBe(0) // never negative within the work area
  })

  it('returns the window at origin when there are no displays', () => {
    const f = centerOn({ width: 820, height: 600 }, [], null)
    expect(f).toEqual({ x: 0, y: 0, width: 820, height: 600 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/display.test.ts`
Expected: FAIL — cannot find module `./display`.

- [ ] **Step 3: Write `src/bun/display.ts`**

```ts
// Pure geometry helpers for window placement. Types are a structural subset of
// electrobun's Screen.Display / Rectangle so Screen.getAllDisplays() can be
// passed in directly, while this module stays free of native imports (testable).
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Display {
  bounds: Rect
  workArea: Rect
  isPrimary: boolean
}

export interface Point {
  x: number
  y: number
}

const contains = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height

function pickDisplay(displays: Display[], anchor: Point | null): Display | null {
  if (displays.length === 0) return null
  if (anchor) {
    const hit = displays.find((d) => contains(d.bounds, anchor))
    if (hit) return hit
  }
  return displays.find((d) => d.isPrimary) ?? displays[0]
}

/** Center `size` within the work area of the display holding `anchor` (else
 *  primary, else origin). Origin is clamped to the work area's top-left. */
export function centerOn(
  size: { width: number; height: number },
  displays: Display[],
  anchor: Point | null,
): Rect {
  const target = pickDisplay(displays, anchor)
  if (!target) return { x: 0, y: 0, width: size.width, height: size.height }
  const a = target.workArea
  const x = Math.max(a.x, a.x + Math.round((a.width - size.width) / 2))
  const y = Math.max(a.y, a.y + Math.round((a.height - size.height) / 2))
  return { x, y, width: size.width, height: size.height }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/bun/display.test.ts`
Expected: PASS.

- [ ] **Step 5: Format & commit**

```bash
bun run format
git add src/bun/display.ts src/bun/display.test.ts
git commit -m "feat(display): pure centerOn helper for current-display placement"
```

---

## Task 5: RPC contract + client plumbing

**Files:**
- Modify: `src/shared/lib/rpcContract.ts`
- Modify: `src/shared/lib/rpc.ts`

No new unit test — this is type + passthrough plumbing, exercised by Tasks 6–8. Verified by the renderer test suite still passing.

- [ ] **Step 1: Edit `src/shared/lib/rpcContract.ts`**

Change the `getInitialRoute` signature (and its doc comment) to carry the window identity:

```ts
  // The hash route this window should open at, applied client-side before mount,
  // plus whether this is the main window. The bundled views:// scheme can't load
  // an initial URL with the route in its fragment, so popouts load the bare app
  // and ask the host where to go. `isMain` (not a null route) identifies the main
  // window, so the main window can also carry a restored route.
  getInitialRoute: () => Promise<{ route: string | null; isMain: boolean }>
```

Add two new requests near the MCP toggle group (after `revealMcpToken`):

```ts
  // Startup behavior. The settings General pane reads/writes the single
  // "Restore windows on startup" preference (config.json), default on.
  getStartupPrefs: () => Promise<{ restoreOnStartup: boolean }>
  setRestoreOnStartup: (a: { enabled: boolean }) => Promise<{ ok: true }>
```

- [ ] **Step 2: Edit `src/shared/lib/rpc.ts`**

Add the two passthroughs to the `rpc` object (e.g. after `revealMcpToken`):

```ts
  getStartupPrefs: () => client().getStartupPrefs(),
  setRestoreOnStartup: (a) => client().setRestoreOnStartup(a),
```

(`getInitialRoute` already forwards verbatim — no change needed there.)

- [ ] **Step 3: Verify the renderer suite still compiles/passes**

Run: `bunx vitest run src/shared`
Expected: PASS (no behavioral change yet).

- [ ] **Step 4: Format & commit**

```bash
bun run format
git add src/shared/lib/rpcContract.ts src/shared/lib/rpc.ts
git commit -m "feat(rpc): isMain on getInitialRoute + startup-prefs requests"
```

---

## Task 6: Host wiring (`index.ts`)

**Files:**
- Modify: `src/bun/index.ts`

This task is integration wiring over the now-tested pure modules. There is no new unit test (Electrobun windows can't mount under vitest); verify by running the full suite (existing host tests must stay green) plus a manual smoke check in Step 9.

- [ ] **Step 1: Update imports**

Add `Screen` to the electrobun import (line 1):

```ts
import Electrobun, { BrowserWindow, BrowserView, Utils, ApplicationMenu, Screen } from 'electrobun/bun'
```

Add `saveRestoreOnStartup` to the config import (line 2):

```ts
import { loadConfig, saveConfig, clearConfig, saveRestoreOnStartup } from './config'
```

Add the session + restore + display imports (after the config import block):

```ts
import {
  loadSession,
  initMain,
  setMainPosition,
  setMainSize,
  setMainRoute,
  registerPopout,
  setPopoutPosition,
  setPopoutSize,
  removePopout,
  clearPopouts,
  type Frame,
} from './session'
import { planRestore } from './restore'
import { centerOn } from './display'
```

- [ ] **Step 2: Add a geometry-wiring helper and the popout id counter**

Just below `function track(...)` (around line 58), add:

```ts
// Attach OS-driven geometry capture: resize carries the full frame, move only
// x/y (we keep the last-known size). Both schedule a debounced session write.
function wireGeometry(
  w: BrowserWindow,
  onResize: (x: number, y: number, width: number, height: number) => void,
  onMove: (x: number, y: number) => void,
): void {
  w.on('resize', (e: unknown) => {
    const d = (e as { data: { x: number; y: number; width: number; height: number } }).data
    onResize(d.x, d.y, d.width, d.height)
  })
  w.on('move', (e: unknown) => {
    const d = (e as { data: { x: number; y: number } }).data
    onMove(d.x, d.y)
  })
}

// Combined-issues windows have no natural key; assign a stable id per open so
// geometry updates and the session entry line up. Issue windows reuse their key.
let issuesSeq = 0
```

- [ ] **Step 3: Change `buildRpc` to take an identity object**

Replace the signature and the two affected handlers. Change the signature:

```ts
function buildRpc(opts: { route: string | null; isMain: boolean }) {
```

Replace the `getInitialRoute` handler:

```ts
        getInitialRoute: async () => ({ route: opts.route, isMain: opts.isMain }),
```

Replace the `reportAppState` handler so the main window also feeds the session route:

```ts
        reportAppState: async (s) => {
          // Only the main window reports; cache for MCP and fold the route into
          // the session model so a restored launch reopens on the same view.
          if (opts.isMain) {
            cacheSnapshot(s)
            setMainRoute(s.route, s.view)
          }
          return { ok: true }
        },
```

Add the two startup-prefs handlers (next to `revealMcpToken`):

```ts
        getStartupPrefs: async () => ({ restoreOnStartup: loadConfig().restoreOnStartup }),
        setRestoreOnStartup: async ({ enabled }) => {
          saveRestoreOnStartup(enabled)
          return { ok: true }
        },
```

- [ ] **Step 4: Frame override + session registration in `openIssueWindow`**

Replace the whole `openIssueWindow` function with:

```ts
function openIssueWindow(
  { fullPath, iid }: { fullPath: string; iid: string },
  frame?: Frame,
): { ok: boolean } {
  const key = `${fullPath}#${iid}`
  const existing = issueWindows.get(key)
  if (existing) {
    existing.activate()
    return { ok: true }
  }
  const repo = fullPath.split('/').at(-1) ?? fullPath
  // Cascade each new window so stacked issue windows don't perfectly overlap.
  const offset = issueWindows.size * 24
  const resolved: Frame = frame ?? { x: 120 + offset, y: 120 + offset, width: 720, height: 900 }
  const issueWin = track(
    new BrowserWindow({
      title: `#${iid} · ${repo}`,
      url,
      frame: resolved,
      rpc: buildRpc({ route: issueWindowRoute(fullPath, iid), isMain: false }),
    }),
  )
  // Register before inserting so a synchronous close can't strand a stale entry.
  issueWin.on('close', () => {
    issueWindows.delete(key)
    removePopout(key)
  })
  wireGeometry(
    issueWin,
    (x, y, w, h) => setPopoutSize(key, x, y, w, h),
    (x, y) => setPopoutPosition(key, x, y),
  )
  issueWindows.set(key, issueWin)
  registerPopout({ id: key, kind: 'issue', fullPath, iid, frame: resolved })
  return { ok: true }
}
```

- [ ] **Step 5: Frame override + session registration in `openIssuesWindow`**

Replace the whole `openIssuesWindow` function with:

```ts
function openIssuesWindow(
  { fullPath, iids }: { fullPath: string; iids: string[] },
  frame?: Frame,
  restoreId?: string,
): { ok: boolean } {
  const repo = fullPath.split('/').at(-1) ?? fullPath
  const offset = issueWindows.size * 24
  const resolved: Frame = frame ?? { x: 140 + offset, y: 140 + offset, width: 760, height: 920 }
  const id = restoreId ?? `issues:${++issuesSeq}`
  const issuesWin = track(
    new BrowserWindow({
      title: `${iids.length} issues · ${repo}`,
      url,
      frame: resolved,
      rpc: buildRpc({ route: issuesWindowRoute(fullPath, iids), isMain: false }),
    }),
  )
  issuesWindows.add(issuesWin)
  issuesWin.on('close', () => {
    issuesWindows.delete(issuesWin)
    removePopout(id)
  })
  wireGeometry(
    issuesWin,
    (x, y, w, h) => setPopoutSize(id, x, y, w, h),
    (x, y) => setPopoutPosition(id, x, y),
  )
  registerPopout({ id, kind: 'issues', fullPath, iids, frame: resolved })
  return { ok: true }
}
```

- [ ] **Step 6: Center the settings window**

Replace the whole `openSettingsWindow` function with:

```ts
// Center on the display holding the main window (else primary). Settings is
// never restored from session — always opens centered on the current display.
function mainWindowCenter(): { x: number; y: number } | null {
  if (!windows.has(win)) return null
  const f = win.getFrame()
  return { x: f.x + f.width / 2, y: f.y + f.height / 2 }
}

function openSettingsWindow(): { ok: boolean } {
  if (settingsWindow) {
    settingsWindow.activate()
    return { ok: true }
  }
  const frame = centerOn({ width: 820, height: 600 }, Screen.getAllDisplays(), mainWindowCenter())
  const winS = track(
    new BrowserWindow({
      title: 'Settings',
      url,
      frame,
      rpc: buildRpc({ route: settingsWindowRoute(), isMain: false }),
    }),
  )
  winS.on('close', () => {
    settingsWindow = null
  })
  settingsWindow = winS
  return { ok: true }
}
```

(Renamed the local `win` → `winS` so it doesn't shadow the main `win` referenced by `mainWindowCenter`.)

- [ ] **Step 7: Compute the restore plan and build the main window from it**

Replace the main-window construction block (currently the `const win = track(new BrowserWindow({ title: 'Lumen', ... }))` at ~line 230) with:

```ts
const startupConfig = loadConfig()
const restorePlan = planRestore({
  enabled: startupConfig.restoreOnStartup,
  connected: Boolean(startupConfig.gitlabUrl && startupConfig.token),
  session: loadSession(),
})
const MAIN_DEFAULT_FRAME: Frame = { x: 80, y: 80, width: 1280, height: 860 }
const mainFrame: Frame = restorePlan.mainFrame ?? MAIN_DEFAULT_FRAME

const win = track(
  new BrowserWindow({
    title: 'Lumen',
    url,
    frame: mainFrame,
    rpc: buildRpc({ route: restorePlan.mainRoute, isMain: true }),
  }),
)
// Seed the model with the opening frame so move/resize merges have a base, and
// drop last session's popout list from the model — the replay loop below
// re-registers only the popouts we actually reopen (none if restore is off).
initMain(mainFrame, restorePlan.mainRoute, restorePlan.mainView)
clearPopouts()
wireGeometry(
  win,
  (x, y, w, h) => setMainSize(x, y, w, h),
  (x, y) => setMainPosition(x, y),
)
```

- [ ] **Step 8: Replay popouts after the app is wired**

At the very end of the file (after `ApplicationMenu.on(...)`, before the trailing `void win` / `void Electrobun`), add:

```ts
// Reopen the issue/combined popouts that were open at last quit, each at its
// remembered frame. Gated entirely by planRestore (empty unless enabled +
// connected). The settings window is intentionally never replayed.
for (const p of restorePlan.popouts) {
  if (p.kind === 'issue') {
    openIssueWindow({ fullPath: p.fullPath, iid: p.iid }, p.frame)
  } else {
    openIssuesWindow({ fullPath: p.fullPath, iids: p.iids }, p.frame, p.id)
  }
}
```

- [ ] **Step 9: Verify the full suite passes and smoke-test manually**

Run: `bunx vitest run`
Expected: PASS (existing host tests — `issueWindow`, `settingsWindow`, `serverHealth`, `config`, etc. — stay green; new session/restore/display suites pass).

Manual smoke (the parts vitest can't cover):
- `bun run app:hmr` (or the project's launch command). With a connected instance: resize/move the main window, navigate to Issues, pop out an issue, quit, relaunch → main window returns to its size/position on Issues and the issue popout reopens at its place.
- Open Settings from any main-window position / on a second display → it appears centered on that display.
- Toggle the setting off (Task 8), quit, relaunch → clean default launch.

- [ ] **Step 10: Format & commit**

```bash
bun run format
git add src/bun/index.ts
git commit -m "feat(session): capture geometry, restore windows on boot, center settings"
```

---

## Task 7: Renderer boot identity (`main.ts`)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Edit the boot destructure and the report gate**

Change line 25 to pull `isMain`:

```ts
  const [{ url }, { route, isMain }] = await Promise.all([rpc.getConfig(), rpc.getInitialRoute()])
```

Change the install gate (currently `if (!route) installAppStateReport(router)`) and its comment to:

```ts
  // MCP app-control + session-route reporting live only in the main window. The
  // main window is identified by isMain (it may now carry a restored route, so a
  // null route no longer distinguishes it). Popouts and settings get isMain=false.
  if (isMain) installAppStateReport(router)
```

(The `if (route) window.location.hash = route` line on ~30 is unchanged — it already applies any non-null route, which now includes the restored main route.)

- [ ] **Step 2: Verify the renderer suite passes**

Run: `bunx vitest run src/App.test.ts src/shared`
Expected: PASS.

- [ ] **Step 3: Format & commit**

```bash
bun run format
git add src/main.ts
git commit -m "feat(main): identify main window by isMain so it can restore a route"
```

---

## Task 8: General settings pane with the toggle

**Files:**
- Create: `src/features/settings/panes/GeneralPane.vue`
- Test: `src/features/settings/panes/GeneralPane.test.ts`
- Modify: `src/features/settings/useSettingsNav.ts`
- Modify: `src/features/settings/useSettingsNav.test.ts`

- [ ] **Step 1: Write the failing pane test**

Create `src/features/settings/panes/GeneralPane.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getStartupPrefs = vi.fn(async () => ({ restoreOnStartup: true }))
const setRestoreOnStartup = vi.fn(async (_a: { enabled: boolean }) => ({ ok: true as const }))
vi.mock('@/shared/lib/rpc', () => ({
  rpc: { getStartupPrefs: () => getStartupPrefs(), setRestoreOnStartup: (a: { enabled: boolean }) => setRestoreOnStartup(a) },
}))

import GeneralPane from './GeneralPane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  getStartupPrefs.mockResolvedValue({ restoreOnStartup: true })
})

describe('GeneralPane', () => {
  it('reads the current preference on mount', async () => {
    const w = mount(GeneralPane)
    await flushPromises()
    expect(getStartupPrefs).toHaveBeenCalledTimes(1)
    expect(w.get('[data-test="restore-toggle"]').attributes('aria-pressed')).toBe('true')
  })

  it('renders the toggle off when the preference is false', async () => {
    getStartupPrefs.mockResolvedValue({ restoreOnStartup: false })
    const w = mount(GeneralPane)
    await flushPromises()
    expect(w.get('[data-test="restore-toggle"]').attributes('aria-pressed')).toBe('false')
  })

  it('writes the flipped preference when toggled', async () => {
    const w = mount(GeneralPane)
    await flushPromises()
    await w.get('[data-test="restore-toggle"]').trigger('click')
    await flushPromises()
    expect(setRestoreOnStartup).toHaveBeenCalledWith({ enabled: false })
    expect(w.get('[data-test="restore-toggle"]').attributes('aria-pressed')).toBe('false')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/settings/panes/GeneralPane.test.ts`
Expected: FAIL — cannot find `./GeneralPane.vue`.

- [ ] **Step 3: Write `src/features/settings/panes/GeneralPane.vue`**

Mirrors the MCP pane's `Button`-as-toggle convention (`aria-pressed`, `:variant`):

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import PaneHeader from './PaneHeader.vue'

const restoreOnStartup = ref(true)
const busy = ref(false)

onMounted(async () => {
  restoreOnStartup.value = (await rpc.getStartupPrefs()).restoreOnStartup
})

async function toggle() {
  if (busy.value) return
  busy.value = true
  try {
    const next = !restoreOnStartup.value
    await rpc.setRestoreOnStartup({ enabled: next })
    restoreOnStartup.value = next
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="max-w-2xl space-y-6">
    <PaneHeader
      eyebrow="General"
      title="Startup"
      description="Control how Lumen launches."
    />
    <div class="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <span class="flex flex-col">
        <span class="text-sm font-medium text-foreground">Restore windows on startup</span>
        <span class="text-2xs text-muted-foreground">
          Reopen your windows at their last size and position, and return the main
          window to the view you left.
        </span>
      </span>
      <Button
        type="button"
        data-test="restore-toggle"
        :variant="restoreOnStartup ? 'default' : 'outline'"
        :aria-pressed="restoreOnStartup"
        :disabled="busy"
        @click="toggle"
      >
        {{ restoreOnStartup ? 'On' : 'Off' }}
      </Button>
    </div>
  </section>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/settings/panes/GeneralPane.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing nav test update**

Edit `src/features/settings/useSettingsNav.test.ts` — update the order assertion to include `general` first, and the default-selection assertion:

```ts
  it('lists the panes in order with General first', () => {
    expect(SETTINGS_PANES.map((p) => p.id)).toEqual([
      'general',
      'connection',
      'agent',
      'appearance',
      'data',
      'about',
    ])
  })

  it('selects the first pane by default and can switch', () => {
    const nav = useSettingsNav()
    expect(nav.selected.value).toBe('general')
    nav.select('agent')
    expect(nav.selected.value).toBe('agent')
  })
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bunx vitest run src/features/settings/useSettingsNav.test.ts`
Expected: FAIL — `general` not present / default is `connection`.

- [ ] **Step 7: Edit `src/features/settings/useSettingsNav.ts`**

Add the import and prepend the pane:

```ts
import { Settings2, Plug, Bot, Palette, Database, Info } from '@lucide/vue'
import GeneralPane from './panes/GeneralPane.vue'
```

```ts
export const SETTINGS_PANES: SettingsPane[] = [
  { id: 'general', label: 'General', icon: Settings2, component: GeneralPane },
  { id: 'connection', label: 'Connection', icon: Plug, component: ConnectionPane },
  { id: 'agent', label: 'Agent access', icon: Bot, component: AgentAccessPane },
  { id: 'appearance', label: 'Appearance', icon: Palette, component: AppearancePane },
  { id: 'data', label: 'Data & cache', icon: Database, component: DataCachePane },
  { id: 'about', label: 'About', icon: Info, component: AboutPane },
]
```

(If `Settings2` is not exported by `@lucide/vue`, use `Cog` or `Power` — confirm the icon name resolves; the others in this file are already imported from there.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `bunx vitest run src/features/settings`
Expected: PASS (nav + GeneralPane + existing pane tests).

- [ ] **Step 9: Format & commit**

```bash
bun run format
git add src/features/settings/panes/GeneralPane.vue src/features/settings/panes/GeneralPane.test.ts src/features/settings/useSettingsNav.ts src/features/settings/useSettingsNav.test.ts
git commit -m "feat(settings): General pane with restore-windows toggle"
```

---

## Final Verification

- [ ] **Step 1: Run the whole suite**

Run: `bunx vitest run`
Expected: PASS across all suites.

- [ ] **Step 2: Format**

Run: `bun run format`

- [ ] **Step 3: Manual end-to-end smoke** (see Task 6, Step 9) — confirm restore round-trips and the settings window centers. Note: geometry capture depends on Electrobun emitting `move`/`resize` callbacks; if a platform doesn't, restore degrades gracefully to default frames (no crash), which is acceptable for v1.

---

## Notes / Known Limitations

- **Off-screen geometry** (a monitor unplugged between sessions): v1 stores raw x/y and does not reconcile against currently-connected displays. If a restored window lands off-screen, a follow-up can clamp main/popout frames through `centerOn`-style logic. Flagged, not silently handled.
- **Route capture cadence:** the main route is folded into the session via the existing debounced `reportAppState`; the on-disk route can lag live state by the debounce window — acceptable since restore is best-effort.
- **Combined-issues identity:** ids are per-process (`issues:N`), so a replayed combined window keeps its stored id across the launch (passed via `restoreId`) but a brand-new one gets a fresh counter value — no collision because replay happens before any fresh combined window can be opened.
