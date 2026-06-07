import { reactive } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'
import { rpc } from '@/shared/lib/rpc'
import { PROBE_QUERY } from './useGitlabConnect'

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

export type ProbeOutcome = 'ok' | 'auth' | 'down'

/**
 * The authoritative session health check: the cheapest authenticated query, run
 * directly through `rpc` — bypassing vue-query so it never re-triggers
 * installAuthWatch (no feedback loop). A clean 200 means the token is valid and
 * the server is reachable; 401/403 means the token is genuinely the problem;
 * anything else (5xx / transport throw → 503 sentinel) means the server is down.
 * Shared by installAuthWatch (confirm before latching) and useServerRecovery.
 */
export async function probeServer(): Promise<ProbeOutcome> {
  try {
    const res = await rpc.gitlabGraphql({ query: PROBE_QUERY })
    if (res.status === 401 || res.status === 403) return 'auth'
    // Any 200 proves the token works and the server is reachable. A real token
    // problem comes back as 401/403 (above), not a 200 with body errors.
    if (res.status === 200) return 'ok'
    return 'down'
  } catch {
    return 'down'
  }
}

// After a confirm-probe decides not to latch, don't re-probe for this long — a
// single failing request often retries, and we don't want a probe per retry.
const VERIFY_COOLDOWN_MS = 2000

/**
 * Watch the query + mutation caches and react to failures. An `unavailable`
 * error raises the (self-healing) banner directly. An `auth` error does NOT
 * immediately latch the blocking overlay: a single 401 can be a transient
 * gateway blip and a 403 is a forbidden sub-resource — neither means the session
 * is dead. We first confirm with one authoritative probe; only a probe that also
 * fails auth latches the overlay. A clean probe proves the token is fine, so the
 * error stays local (surfaced per-query) and the user is never wrongly logged
 * out. The probe runs through `rpc` (not vue-query) so it can't re-enter these
 * caches. Returns a single unsubscribe that detaches both subscriptions.
 */
export function installAuthWatch(queryClient: QueryClient): () => void {
  let verifying = false
  let lastVerify = 0

  async function confirmThenLatch(): Promise<void> {
    if (sessionState.expired || verifying) return
    if (Date.now() - lastVerify < VERIFY_COOLDOWN_MS) return
    verifying = true
    try {
      const outcome = await probeServer()
      if (outcome === 'auth') markSessionExpired()
      else if (outcome === 'down') markServerUnavailable()
      // 'ok' → token is valid; the auth error was transient or a forbidden
      // sub-resource. Do not latch the overlay.
    } finally {
      verifying = false
      lastVerify = Date.now()
    }
  }

  const route = (err: unknown) => {
    if (isAuthError(err)) void confirmThenLatch()
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
