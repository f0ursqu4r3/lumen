import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { usePipelineWatch } from './usePipelineWatch'

beforeEach(() => localStorage.clear())

describe('usePipelineWatch', () => {
  it('subscribes, reports membership, and counts', () => {
    const w = usePipelineWatch(ref('grp/proj'))
    expect(w.isWatched('p1')).toBe(false)
    w.subscribe('p1')
    expect(w.isWatched('p1')).toBe(true)
  })

  it('subscribing twice is idempotent', () => {
    const w = usePipelineWatch(ref('grp/proj'))
    w.subscribe('p1')
    w.subscribe('p1')
    expect(w.ids.value).toEqual(['p1'])
  })

  it('toggle flips membership; unwatch removes', () => {
    const w = usePipelineWatch(ref('grp/proj'))
    w.toggle('p1')
    expect(w.isWatched('p1')).toBe(true)
    w.toggle('p1')
    expect(w.isWatched('p1')).toBe(false)
    w.subscribe('p2')
    w.unwatch('p2')
    expect(w.isWatched('p2')).toBe(false)
  })

  it('persists to a project-scoped localStorage key', async () => {
    usePipelineWatch(ref('grp/proj')).subscribe('p1')
    await nextTick() // useLocalStorage flushes the write on the next tick
    expect(JSON.parse(localStorage.getItem('lumen:pipeline-watch:grp/proj')!)).toEqual(['p1'])
    // A fresh instance for the same project rehydrates the saved set.
    expect(usePipelineWatch(ref('grp/proj')).isWatched('p1')).toBe(true)
  })

  it('keeps each project’s subscriptions separate', async () => {
    usePipelineWatch(ref('grp/a')).subscribe('p1')
    await nextTick()
    expect(usePipelineWatch(ref('grp/b')).isWatched('p1')).toBe(false)
  })
})
