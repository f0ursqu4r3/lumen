import { ref } from 'vue'

export type ToastTone = 'success' | 'failed' | 'info'

export interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
  /** Absolute URL to open when the toast body is clicked (e.g. a pipeline). */
  href?: string
  /** ms before auto-dismiss; 0 keeps it until dismissed. */
  duration?: number
}

export interface Toast extends ToastInput {
  id: string
}

// Failures linger a little longer than successes — you're more likely to want to
// act on them before they slide away.
export const TOAST_DURATION = { success: 6000, failed: 10_000, info: 7000 } as const

// Module-level singleton so any caller can pushToast(...) and the single mounted
// <ToastHost/> renders the queue. Mirrors useConfirm's shared-state approach.
export const toasts = ref<Toast[]>([])
const timers = new Map<string, ReturnType<typeof setTimeout>>()

let seq = 0

export function pushToast(input: ToastInput): string {
  seq += 1
  const id = `t${seq}`
  const tone = input.tone ?? 'info'
  toasts.value = [...toasts.value, { ...input, tone, id }]
  const duration = input.duration ?? TOAST_DURATION[tone]
  if (duration > 0)
    timers.set(
      id,
      setTimeout(() => dismissToast(id), duration),
    )
  return id
}

export function dismissToast(id: string): void {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

// Test/teardown helper — drop everything and cancel pending timers.
export function clearToasts(): void {
  timers.forEach((t) => clearTimeout(t))
  timers.clear()
  toasts.value = []
}

export function useToast() {
  return { toasts, pushToast, dismissToast }
}
