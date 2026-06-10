import { ref } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'
import { clearServerUnavailable, markSessionExpired, probeServer } from './useSession'

/** Recovery backoff: 2s → 5s → 15s, capped at 15s. */
export function backoffMs(attempt: number): number {
  const steps = [2000, 5000, 15000]
  return steps[Math.min(attempt, steps.length - 1)]
}

/**
 * Owns the recovery timer. `start()` schedules the first probe after backoffMs(0)
 * and keeps probing on backoff while the server stays down. On success it clears
 * the banner and refetches every query; on an auth result it escalates to the
 * expired overlay. `stop()` cancels any pending probe.
 *
 * For the banner UI it also exposes `secondsLeft` (a live countdown to the next
 * scheduled probe), `probing` (true while a probe is in flight), and `retryNow()`
 * (skip the wait and probe immediately).
 */
export function useServerRecovery(queryClient: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let countdown: ReturnType<typeof setInterval> | null = null
  let attempt = 0
  let cancelled = false
  const secondsLeft = ref(0)
  const probing = ref(false)

  function clearCountdown() {
    if (countdown) {
      clearInterval(countdown)
      countdown = null
    }
  }

  function schedule() {
    const ms = backoffMs(attempt)
    secondsLeft.value = Math.ceil(ms / 1000)
    clearCountdown()
    countdown = setInterval(() => {
      if (secondsLeft.value > 0) secondsLeft.value -= 1
    }, 1000)
    timer = setTimeout(() => void tick(), ms)
  }

  async function tick() {
    timer = null
    clearCountdown()
    secondsLeft.value = 0
    probing.value = true
    const outcome = await probeServer()
    probing.value = false
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

  /** Skip the remaining backoff and probe immediately. No-op while a probe runs. */
  function retryNow() {
    if (cancelled || probing.value) return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    clearCountdown()
    void tick()
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
    clearCountdown()
    secondsLeft.value = 0
    probing.value = false
    attempt = 0
  }

  return { start, stop, retryNow, secondsLeft, probing }
}
