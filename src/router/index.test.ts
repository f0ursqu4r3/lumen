import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from './index'

describe('issues-window route', () => {
  it('resolves the route and maps fullPath + comma-split iids from the query', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const resolved = router.resolve('/projects/grp/proj/issues-window?iids=42,7,13&window=1')
    expect(resolved.name).toBe('issues-window')
    const record = resolved.matched.at(-1)!
    const props = (record.props.default as (r: typeof resolved) => Record<string, unknown>)(resolved)
    expect(props).toEqual({ fullPath: 'grp/proj', iids: ['42', '7', '13'], windowed: true })
  })

  it('yields an empty iids array when the query is missing', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const resolved = router.resolve('/projects/grp/proj/issues-window')
    const record = resolved.matched.at(-1)!
    const props = (record.props.default as (r: typeof resolved) => Record<string, unknown>)(resolved)
    expect(props).toEqual({ fullPath: 'grp/proj', iids: [], windowed: false })
  })
})
