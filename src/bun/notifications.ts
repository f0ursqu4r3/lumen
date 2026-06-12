import type { NotifyArgs } from '../shared/lib/rpcContract'

export interface NormalizedNotification {
  title: string
  body?: string
  subtitle?: string
  silent?: boolean
}

const FALLBACK_TITLE = 'Lumen'
export const NOTIFICATION_LIMITS = {
  title: 80,
  subtitle: 120,
  body: 240,
} as const

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return `${chars.slice(0, Math.max(0, max - 3)).join('')}...`
}

export function normalizeNotification(input: Partial<NotifyArgs>): NormalizedNotification {
  const title = cleanText(input.title, NOTIFICATION_LIMITS.title) ?? FALLBACK_TITLE
  const body = cleanText(input.body, NOTIFICATION_LIMITS.body)
  const subtitle = cleanText(input.subtitle, NOTIFICATION_LIMITS.subtitle)
  return {
    title,
    ...(body ? { body } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(input.silent === undefined ? {} : { silent: input.silent === true }),
  }
}

export function showNotificationSafely(
  show: (notification: NormalizedNotification) => void,
  input: Partial<NotifyArgs>,
): { ok: true } {
  const notification = normalizeNotification(input)
  try {
    show(notification)
  } catch (e) {
    console.warn('Failed to show OS notification', e)
  }
  return { ok: true }
}
