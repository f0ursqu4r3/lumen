import { isActivePipeline } from '@/gitlab/pipelineParams'
import type { Pipeline } from '@/features/pipelines/composables/usePipelines'

export const shortSha = (sha: string | null) => sha?.slice(0, 8) ?? ''

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m ? `${m}m ${s}s` : `${s}s`
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
]
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  for (const [unit, secs] of UNITS) {
    if (diff >= secs || unit === 'second') return RELATIVE.format(-Math.floor(diff / secs), unit)
  }
  return ''
}

export function timing(p: Pipeline): string {
  const ago = timeAgo(p.createdAt)
  const dur = formatDuration(p.duration)
  return dur && !isActivePipeline(p.status) ? `${ago} · ${dur}` : ago
}
