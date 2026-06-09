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
