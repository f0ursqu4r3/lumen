import { reactive } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'

// Shared singleton flag, flipped true when an app data query/mutation fails
// authentication (token expired/revoked/insufficient scope). The mounted
// <SessionExpiredOverlay/> watches this to block the screen and offer
// re-connect. Mirrors useSettings' module-level reactive-state pattern.
export const sessionState = reactive<{ expired: boolean }>({ expired: false })

/**
 * True when `err` is the shape `normalizeError` throws for an auth failure: a
 * GitLabError with kind === 'auth' (covers both 401 and 403). See
 * src/gitlab/errors.ts.
 */
export function isAuthError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { kind?: unknown }).kind === 'auth'
  )
}

/** Flip the session into the expired state (idempotent). */
export function markSessionExpired(): void {
  sessionState.expired = true
}

/**
 * Watch the query + mutation caches for auth failures and flip sessionState
 * when one appears. Recovery probes run directly through `rpc` (not vue-query),
 * so the overlay's own re-probe never reaches these caches — no re-trigger
 * loop. Returns a single unsubscribe that detaches both subscriptions.
 */
export function installAuthWatch(queryClient: QueryClient): () => void {
  const offQuery = queryClient.getQueryCache().subscribe((event) => {
    if (isAuthError(event.query.state.error)) markSessionExpired()
  })
  const offMutation = queryClient.getMutationCache().subscribe((event) => {
    if (isAuthError(event.mutation?.state.error)) markSessionExpired()
  })
  return () => {
    offQuery()
    offMutation()
  }
}
