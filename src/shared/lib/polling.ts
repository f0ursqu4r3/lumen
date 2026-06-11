import { sessionState } from '@/shared/composables/useSession'

// ±15% spread so N windows/pollers don't all hit GitLab on the same tick.
const JITTER = 0.15

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function paused(): boolean {
  // Recovery is host-owned (see src/bun/serverHealth.ts) — while the server is
  // unavailable/expired every poller must stand down so a recovering GitLab
  // isn't hammered by fixed-tick refetches. A hidden/minimized window has no
  // viewer, so it stands down too.
  return sessionState.unavailable || sessionState.expired || isHidden()
}

/**
 * Build a vue-query `refetchInterval`: poll every ~baseMs (jittered), but return
 * false to PAUSE while the server is down/expired or this window is hidden.
 * vue-query re-evaluates this between fetches, so polling resumes on its own
 * once the server recovers and the window is visible again.
 */
export function pollInterval(baseMs: number): () => number | false {
  return () => {
    if (paused()) return false
    const spread = baseMs * JITTER
    return Math.round(baseMs - spread + Math.random() * spread * 2)
  }
}

/** A `refetchOnWindowFocus` that yields while the server is unavailable/expired. */
export function pollOnFocus(): () => boolean {
  return () => !sessionState.unavailable && !sessionState.expired
}
