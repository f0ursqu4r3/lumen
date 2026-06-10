export type ServerState = 'ok' | 'down' | 'expired'
export type Outcome = 'ok' | 'auth' | 'down'
export interface ServerHealth {
  state: ServerState
  secondsLeft: number
  probing: boolean
}

/** Recovery backoff: 2s → 5s → 15s, capped. */
const BACKOFF = [2000, 5000, 15000]
/** After a confirm-probe declines to latch, don't re-probe for this long. */
const CONFIRM_COOLDOWN_MS = 2000

/**
 * Classify a GitLab response for health. 401 (or 403 carrying a GraphQL/JSON
 * error body) → auth; ≥500 / bodyless-403 (edge-LB) / the transport-503 sentinel
 * → down; everything the server actually answered → ok (reachable). Mirrors the
 * old probeServer/errors.ts semantics.
 */
export function classifyStatus(status: number, hasErrorBody: boolean): Outcome {
  if (status === 401 || (status === 403 && hasErrorBody)) return 'auth'
  if (status >= 500 || status === 403) return 'down'
  return 'ok'
}

let state: ServerState = 'ok'
let secondsLeft = 0
let probing = false
let attempt = 0
let recoveryTimer: ReturnType<typeof setTimeout> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
let confirming = false
let lastConfirm = 0
let probeInFlight = false

let probe: () => Promise<Outcome> = async () => 'ok'
let broadcast: (h: ServerHealth) => void = () => {}

export function startServerHealth(deps: {
  probe: () => Promise<Outcome>
  broadcast: (h: ServerHealth) => void
}): void {
  probe = deps.probe
  broadcast = deps.broadcast
}

export function isProbing(): boolean {
  return probeInFlight
}

export function getHealth(): ServerHealth {
  return { state, secondsLeft, probing }
}

function emit(): void {
  broadcast(getHealth())
}

function clearTimers(): void {
  if (recoveryTimer) {
    clearTimeout(recoveryTimer)
    recoveryTimer = null
  }
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

async function callProbe(): Promise<Outcome> {
  probeInFlight = true
  try {
    return await probe()
  } finally {
    probeInFlight = false
  }
}

function toOk(): void {
  const changed = state !== 'ok'
  clearTimers()
  state = 'ok'
  secondsLeft = 0
  probing = false
  attempt = 0
  if (changed) emit()
}

function toExpired(): void {
  clearTimers()
  state = 'expired'
  secondsLeft = 0
  probing = false
  attempt = 0
  emit()
}

function scheduleProbe(): void {
  const ms = BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
  secondsLeft = Math.ceil(ms / 1000)
  probing = false
  emit()
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    if (secondsLeft > 0) {
      secondsLeft -= 1
      emit()
    }
  }, 1000)
  recoveryTimer = setTimeout(() => void runProbe(), ms)
}

async function runProbe(): Promise<void> {
  recoveryTimer = null
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  secondsLeft = 0
  probing = true
  emit()
  const outcome = await callProbe()
  probing = false
  if (state !== 'down') return
  if (outcome === 'ok') return toOk()
  if (outcome === 'auth') return toExpired()
  attempt += 1
  scheduleProbe()
}

function startRecovery(): void {
  if (state === 'down') return
  state = 'down'
  attempt = 0
  scheduleProbe()
}

async function confirmAuth(): Promise<void> {
  if (confirming) return
  if (Date.now() - lastConfirm < CONFIRM_COOLDOWN_MS) return
  confirming = true
  try {
    const outcome = await callProbe()
    if (state !== 'ok') return
    if (outcome === 'auth') toExpired()
    else if (outcome === 'down') startRecovery()
  } finally {
    confirming = false
    lastConfirm = Date.now()
  }
}

export function observe(outcome: Outcome): void {
  if (outcome === 'ok') {
    if (state !== 'ok') toOk()
    return
  }
  if (state !== 'ok') return
  if (outcome === 'down') return startRecovery()
  void confirmAuth()
}

export function retryNow(): void {
  if (state !== 'down' || probing) return
  clearTimers()
  void runProbe()
}

export function resetForReconnect(): void {
  clearTimers()
  state = 'ok'
  secondsLeft = 0
  probing = false
  attempt = 0
  confirming = false
  lastConfirm = 0
  emit()
}

export function __resetForTest(): void {
  clearTimers()
  state = 'ok'
  secondsLeft = 0
  probing = false
  attempt = 0
  confirming = false
  lastConfirm = 0
  probeInFlight = false
}
