import { isActivePipeline } from '@/gitlab/pipelineParams'
import type { Pipeline } from '@/features/pipelines/composables/usePipelines'
import { timeAgo } from '@/shared/lib/time'

export { timeAgo }

export const shortSha = (sha: string | null) => sha?.slice(0, 8) ?? ''

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m ? `${m}m ${s}s` : `${s}s`
}

export function timing(p: Pipeline): string {
  const ago = timeAgo(p.createdAt)
  const dur = formatDuration(p.duration)
  return dur && !isActivePipeline(p.status) ? `${ago} · ${dur}` : ago
}
