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

export function setPopoutSize(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
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
