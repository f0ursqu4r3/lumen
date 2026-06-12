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
