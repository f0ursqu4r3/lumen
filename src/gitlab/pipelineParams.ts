// Pure helpers for the pipelines feature: status classification, display
// metadata, sort ordering, and the polling cadence. Kept transport-free so they
// can be unit-tested without a Vue Query or GraphQL harness (mirrors how
// issueParams backs useIssues).

// GitLab's PipelineStatusEnum. Listed so a status we don't recognize still
// renders (falls through to a neutral default) instead of throwing.
export type PipelineStatus =
  | 'CREATED'
  | 'WAITING_FOR_RESOURCE'
  | 'PREPARING'
  | 'PENDING'
  | 'RUNNING'
  | 'SCHEDULED'
  | 'MANUAL'
  | 'CANCELING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELED'
  | 'SKIPPED'

// Pipelines change faster than issues, but a 10s cadence × every open window was
// a real load source on the shared GitLab, so this matches ISSUE_POLL_MS (30s).
// Polling is health-gated and jittered host-side (see src/shared/lib/polling.ts).
export const PIPELINE_POLL_MS = 30_000

export const pipelinesKey = (fullPath: string) => ['pipelines', fullPath] as const

// Visual/semantic tone — drives badge color and icon. Several raw statuses
// collapse onto one tone (e.g. all the pre-run states read as "queued").
export type PipelineTone =
  | 'running'
  | 'queued'
  | 'manual'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'skipped'

interface StatusMeta {
  label: string
  tone: PipelineTone
}

const STATUS_META: Record<PipelineStatus, StatusMeta> = {
  CREATED: { label: 'Created', tone: 'queued' },
  WAITING_FOR_RESOURCE: { label: 'Waiting', tone: 'queued' },
  PREPARING: { label: 'Preparing', tone: 'queued' },
  PENDING: { label: 'Pending', tone: 'queued' },
  RUNNING: { label: 'Running', tone: 'running' },
  SCHEDULED: { label: 'Scheduled', tone: 'queued' },
  MANUAL: { label: 'Manual', tone: 'manual' },
  CANCELING: { label: 'Canceling', tone: 'running' },
  SUCCESS: { label: 'Passed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'failed' },
  CANCELED: { label: 'Canceled', tone: 'canceled' },
  SKIPPED: { label: 'Skipped', tone: 'skipped' },
}

const FALLBACK_META: StatusMeta = { label: 'Unknown', tone: 'queued' }

export const statusMeta = (status: string): StatusMeta =>
  STATUS_META[status as PipelineStatus] ?? FALLBACK_META

// In-flight statuses: still doing (or about to do) work. MANUAL/SCHEDULED count
// as active — the pipeline isn't done, it's parked waiting for an action/time —
// so they sort to the top and don't read as a "finished" transition.
const ACTIVE = new Set<string>([
  'CREATED',
  'WAITING_FOR_RESOURCE',
  'PREPARING',
  'PENDING',
  'RUNNING',
  'SCHEDULED',
  'MANUAL',
  'CANCELING',
])

const TERMINAL = new Set<string>(['SUCCESS', 'FAILED', 'CANCELED', 'SKIPPED'])

export const isActivePipeline = (status: string): boolean => ACTIVE.has(status)
export const isTerminalPipeline = (status: string): boolean => TERMINAL.has(status)

// Sort rank: actively running first, other in-flight next, finished last. Within
// a rank the caller sorts by createdAt desc, so the newest is on top.
function statusRank(status: string): number {
  if (status === 'RUNNING' || status === 'CANCELING') return 0
  if (isActivePipeline(status)) return 1
  return 2
}

export interface PipelineLike {
  status: string
  createdAt: string
}

// Running/in-flight surfaced first, then by recency. Pure and stable so the view
// and tests share one ordering. Does not mutate the input.
export function sortPipelines<T extends PipelineLike>(pipelines: readonly T[]): T[] {
  return [...pipelines].sort((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status)
    if (rank !== 0) return rank
    return b.createdAt.localeCompare(a.createdAt)
  })
}
