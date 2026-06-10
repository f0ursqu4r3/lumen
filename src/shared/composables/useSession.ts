import { reactive } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'
import { rpc } from '@/shared/lib/rpc'
import type { ServerHealth } from '@/shared/lib/rpcContract'

// Per-window mirror of the host-owned server-health state (see
// src/bun/serverHealth.ts). `unavailable` drives the non-blocking ConnectionBanner;
// `expired` drives the blocking re-connect overlay; `secondsLeft`/`probing` feed
// the banner's countdown. Written ONLY by installServerHealth — all detection and
// recovery is host-owned and broadcast over `lumen:server-health`.
export const sessionState = reactive<{
  expired: boolean
  unavailable: boolean
  secondsLeft: number
  probing: boolean
}>({
  expired: false,
  unavailable: false,
  secondsLeft: 0,
  probing: false,
})

function apply(h: ServerHealth): void {
  sessionState.expired = h.state === 'expired'
  sessionState.unavailable = h.state === 'down'
  sessionState.secondsLeft = h.secondsLeft
  sessionState.probing = h.probing
}

/**
 * Mirror host server-health into sessionState for this window, and refetch this
 * window's queries when the server recovers (down → ok). Seeds from the current
 * host state on install (so a window opened mid-outage shows the banner), then
 * rides `lumen:server-health` events. Returns a cleanup. Installed once per
 * window from main.ts; never torn down in production.
 */
export function installServerHealth(queryClient: QueryClient): () => void {
  const onEvent = (e: Event) => {
    const h = (e as CustomEvent<ServerHealth>).detail
    const wasDown = sessionState.unavailable
    apply(h)
    if (wasDown && h.state === 'ok') void queryClient.invalidateQueries()
  }
  window.addEventListener('lumen:server-health', onEvent)
  void rpc.getServerHealth().then((h) => apply(h))
  return () => window.removeEventListener('lumen:server-health', onEvent)
}
