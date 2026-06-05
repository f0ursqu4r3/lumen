import { describe, it, expect } from 'vitest'
import { statusMeta, isActivePipeline, isTerminalPipeline, sortPipelines } from './pipelineParams'

describe('statusMeta', () => {
  it('maps known statuses to a label and tone', () => {
    expect(statusMeta('RUNNING')).toEqual({ label: 'Running', tone: 'running' })
    expect(statusMeta('SUCCESS')).toEqual({ label: 'Passed', tone: 'success' })
    expect(statusMeta('FAILED')).toEqual({ label: 'Failed', tone: 'failed' })
    expect(statusMeta('PENDING').tone).toBe('queued')
  })

  it('falls back for an unknown status instead of throwing', () => {
    expect(statusMeta('WAT')).toEqual({ label: 'Unknown', tone: 'queued' })
  })
})

describe('classification', () => {
  it('treats in-flight statuses (incl. manual/scheduled) as active', () => {
    for (const s of ['CREATED', 'PENDING', 'RUNNING', 'MANUAL', 'SCHEDULED', 'CANCELING']) {
      expect(isActivePipeline(s)).toBe(true)
      expect(isTerminalPipeline(s)).toBe(false)
    }
  })

  it('treats finished statuses as terminal', () => {
    for (const s of ['SUCCESS', 'FAILED', 'CANCELED', 'SKIPPED']) {
      expect(isTerminalPipeline(s)).toBe(true)
      expect(isActivePipeline(s)).toBe(false)
    }
  })
})

describe('sortPipelines', () => {
  it('surfaces running first, then other active, then finished, newest within rank', () => {
    const input = [
      { id: 'done-old', status: 'SUCCESS', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'pending', status: 'PENDING', createdAt: '2026-01-02T00:00:00Z' },
      { id: 'running', status: 'RUNNING', createdAt: '2026-01-01T12:00:00Z' },
      { id: 'done-new', status: 'FAILED', createdAt: '2026-01-03T00:00:00Z' },
    ]
    expect(sortPipelines(input).map((p) => p.id)).toEqual([
      'running',
      'pending',
      'done-new',
      'done-old',
    ])
  })

  it('does not mutate its input', () => {
    const input = [
      { id: 'a', status: 'SUCCESS', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', status: 'RUNNING', createdAt: '2026-01-02T00:00:00Z' },
    ]
    const before = input.map((p) => p.id)
    sortPipelines(input)
    expect(input.map((p) => p.id)).toEqual(before)
  })
})
