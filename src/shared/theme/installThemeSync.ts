import type { ThemeState } from '@/shared/lib/rpcContract'
import { applyTheme, writeStored } from './applyTheme'

let listener: ((e: Event) => void) | null = null

/**
 * Every window installs this once (from main.ts) so a theme change broadcast by
 * any window re-applies here too. The durable store is localStorage; this keeps
 * each window's mirror fresh so a later-opened window also boots correct. Mirrors
 * installMcpCacheSync / installServerHealth. NEVER calls rpc.broadcastTheme — it
 * only applies + persists, so there is no cross-window feedback loop.
 */
export function installThemeSync(): void {
  if (listener) return // install-once: a second call would duplicate the listener
  listener = (e: Event) => {
    const state = (e as CustomEvent).detail as ThemeState | undefined
    if (!state?.themeId) return
    applyTheme(document, state)
    writeStored(localStorage, state)
  }
  window.addEventListener('lumen:theme-changed', listener)
}

/** Test-only: uninstall and reset module state. */
export function __resetThemeSync(): void {
  if (listener) window.removeEventListener('lumen:theme-changed', listener)
  listener = null
}
