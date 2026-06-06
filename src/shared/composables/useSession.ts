import { reactive } from 'vue'

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
