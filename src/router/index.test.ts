import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from './index'

describe('issues-window route', () => {
  it('resolves the route and maps fullPath + comma-split iids from the query', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const resolved = router.resolve('/projects/grp/proj/issues-window?iids=42,7,13&window=1')
    expect(resolved.name).toBe('issues-window')
    const record = resolved.matched.at(-1)!
    const props = (record.props.default as (r: typeof resolved) => Record<string, unknown>)(
      resolved,
    )
    expect(props).toEqual({ fullPath: 'grp/proj', iids: ['42', '7', '13'], windowed: true })
  })

  it('yields an empty iids array when the query is missing', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const resolved = router.resolve('/projects/grp/proj/issues-window')
    const record = resolved.matched.at(-1)!
    const props = (record.props.default as (r: typeof resolved) => Record<string, unknown>)(
      resolved,
    )
    expect(props).toEqual({ fullPath: 'grp/proj', iids: [], windowed: false })
  })
})

describe('home + projects routes', () => {
  it('resolves My Work at / and the picker at /projects', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/').name).toBe('home')
    expect(router.resolve('/projects').name).toBe('projects')
  })
})

describe('shell opt-in meta', () => {
  it('opts the global views into the shell', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/').meta.shell).toBe(true)
    expect(router.resolve('/projects').meta.shell).toBe(true)
  })
  it('leaves the issues-window route out of the shell (phase 1)', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues-window').meta.shell).toBeFalsy()
  })
})

describe('shell opt-in for project list routes', () => {
  it('opts issues, merge-requests, and pipelines into the shell', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues').meta.shell).toBe(true)
    expect(router.resolve('/projects/grp/proj/merge-requests').meta.shell).toBe(true)
    expect(router.resolve('/projects/grp/proj/pipelines').meta.shell).toBe(true)
  })
  it('keeps the multi-issue window out of the shell (phase 2)', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues-window').meta.shell).toBeFalsy()
  })
})

describe('shell opt-in for detail routes', () => {
  it('opts issue + merge-request detail into the shell', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues/42').meta.shell).toBe(true)
    expect(router.resolve('/projects/grp/proj/merge-requests/5').meta.shell).toBe(true)
  })
  it('keeps the multi-issue window + connect out of the shell', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/projects/grp/proj/issues-window').meta.shell).toBeFalsy()
    expect(router.resolve('/connect').meta.shell).toBeFalsy()
  })
})

describe('merge request routes', () => {
  it('resolves the MR list and detail routes', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const list = router.resolve('/projects/grp/proj/merge-requests')
    expect(list.name).toBe('merge-requests')
    expect(list.params.fullPath).toBe('grp/proj')

    const detail = router.resolve('/projects/grp/proj/merge-requests/5')
    expect(detail.name).toBe('merge-request')
    const record = detail.matched.at(-1)!
    const props = (record.props.default as (r: typeof detail) => Record<string, unknown>)(detail)
    expect(props).toEqual({ fullPath: 'grp/proj', iid: '5' })
  })
})
