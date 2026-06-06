import type { QueryClient } from '@tanstack/vue-query'
import { rpc } from '@/shared/lib/rpc'
import { PROBE_QUERY } from './useGitlabConnect'
import { clearServerUnavailable, markSessionExpired } from './useSession'

export type ProbeOutcome = 'ok' | 'auth' | 'down'

/** Recovery backoff: 2s → 5s → 15s, capped at 15s. */
export function backoffMs(attempt: number): number {
  const steps = [2000, 5000, 15000]
  return steps[Math.min(attempt, steps.length - 1)]
}

/**
 * Probe the cheapest authenticated query directly through `rpc` — bypassing
 * vue-query so it never re-triggers installAuthWatch. A clean 200 means the
 * server is back; 401/403 means the token is the problem after all.
 */
export async function probeServer(): Promise<ProbeOutcome> {
  try {
    const res = await rpc.gitlabGraphql({ query: PROBE_QUERY })
    if (res.status === 401 || res.status === 403) return 'auth'
    // Any 200 proves the server is reachable — recovery's job is done. A real
    // token problem comes back as 401/403 (above), not a 200 with body errors,
    // so don't keep the banner up over a GraphQL-layer error.
    if (res.status === 200) return 'ok'
    return 'down'
  } catch {
    return 'down'
  }
}

/**
 * Owns the recovery timer. `start()` schedules the first probe after backoffMs(0)
 * and keeps probing on backoff while the server stays down. On success it clears
 * the banner and refetches every query; on an auth result it escalates to the
 * expired overlay. `stop()` cancels any pending probe.
 */
export function useServerRecovery(queryClient: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let cancelled = false

  function schedule() {
    timer = setTimeout(() => void tick(), backoffMs(attempt))
  }

  async function tick() {
    timer = null
    const outcome = await probeServer()
    if (cancelled) return
    if (outcome === 'ok') {
      stop()
      clearServerUnavailable()
      await queryClient.invalidateQueries()
      return
    }
    if (outcome === 'auth') {
      stop()
      markSessionExpired()
      return
    }
    attempt += 1
    schedule()
  }

  function start() {
    if (timer) return
    cancelled = false
    attempt = 0
    schedule()
  }

  function stop() {
    cancelled = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    attempt = 0
  }

  return { start, stop }
}
