import { DEFAULT_THEME_ID, themeById } from './themes'
import { overridesToVars, type ThemeOverrides } from './overrides'
import type { ThemeState } from '@/shared/lib/rpcContract'
export type { ThemeState }

export const THEME_KEY = 'lumen:theme'
export const OVERRIDES_KEY = 'lumen:theme-overrides'

const OVERRIDE_VARS = [
  '--primary',
  '--ring',
  '--phosphor-effect',
  '--radius',
  '--density',
  '--font-sans',
] as const

/** Apply a theme + override delta to a document. Pure; no storage, no events. */
export function applyTheme(doc: Document, state: ThemeState): void {
  const el = doc.documentElement
  const meta = themeById(state.themeId) ?? themeById(DEFAULT_THEME_ID)!
  if (meta.id === DEFAULT_THEME_ID) el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', meta.id)
  if (meta.idiom) el.setAttribute('data-idiom', meta.idiom)
  else el.removeAttribute('data-idiom')
  el.style.colorScheme = meta.colorScheme

  const vars = overridesToVars(state.overrides)
  for (const name of OVERRIDE_VARS) {
    const v = vars[name]
    if (v) el.style.setProperty(name, v)
    else el.style.removeProperty(name)
  }
}

export function readStored(storage: Storage): ThemeState {
  const storedId = storage.getItem(THEME_KEY) ?? DEFAULT_THEME_ID
  const themeId = themeById(storedId) ? storedId : DEFAULT_THEME_ID
  let overrides: ThemeOverrides = {}
  try {
    const raw = storage.getItem(OVERRIDES_KEY)
    if (raw) overrides = JSON.parse(raw) as ThemeOverrides
  } catch {
    overrides = {}
  }
  return { themeId, overrides }
}

export function writeStored(storage: Storage, state: ThemeState): void {
  storage.setItem(THEME_KEY, state.themeId)
  storage.setItem(OVERRIDES_KEY, JSON.stringify(state.overrides))
}

/** Read storage + apply in one call (used at boot and by installThemeSync). */
export function applyStoredTheme(doc: Document, storage: Storage): void {
  applyTheme(doc, readStored(storage))
}
