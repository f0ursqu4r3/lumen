import { reactive } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'

// Shared singleton flags. `expired` blocks the screen with the re-connect
// overlay (token invalid). `unavailable` shows the non-blocking ConnectionBanner
// (server unreachable; the token is fine). They are mutually exclusive — auth
// always wins (see markSessionExpired / markServerUnavailable).
export const sessionState = reactive<{ expired: boolean; unavailable: boolean }>({
  expired: false,
  unavailable: false,
})

/** True when `err` is a GitLabError with kind === 'auth' (covers 401 and 403). */
export function isAuthError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { kind?: unknown }).kind === 'auth'
}

/** True when `err` is a GitLabError with kind === 'unavailable' (5xx / transport). */
export function isUnavailableError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { kind?: unknown }).kind === 'unavailable'
  )
}

/** Flip into the expired (token-invalid) state. Clears any unavailable banner —
 *  auth always wins. Idempotent. */
export function markSessionExpired(): void {
  sessionState.expired = true
  sessionState.unavailable = false
}

/** Raise the server-unavailable banner. No-op once expired — a token problem
 *  must never be downgraded to a transient banner. Idempotent. */
export function markServerUnavailable(): void {
  if (sessionState.expired) return
  sessionState.unavailable = true
}

/** Lower the server-unavailable banner (recovery poll succeeded). */
export function clearServerUnavailable(): void {
  sessionState.unavailable = false
}

/**
 * Watch the query + mutation caches and flip session state on failures: auth
 * errors raise the expired overlay; unavailable errors raise the banner.
 * Recovery probes run directly through `rpc` (not vue-query), so they never
 * reach these caches — no re-trigger loop. Returns a single unsubscribe that
 * detaches both subscriptions.
 */
export function installAuthWatch(queryClient: QueryClient): () => void {
  const route = (err: unknown) => {
    if (isAuthError(err)) markSessionExpired()
    else if (isUnavailableError(err)) markServerUnavailable()
  }
  const offQuery = queryClient.getQueryCache().subscribe((event) => {
    route(event.query.state.error)
  })
  const offMutation = queryClient.getMutationCache().subscribe((event) => {
    route(event.mutation?.state.error)
  })
  return () => {
    offQuery()
    offMutation()
  }
}
