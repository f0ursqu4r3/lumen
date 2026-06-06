import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useSavedViews, sameView } from './useSavedViews'

const keyFor = (p: string) => `lumen:saved-views:${p}`

describe('sameView', () => {
  it('matches regardless of label order or string-vs-array encoding', () => {
    expect(sameView({ label: ['ui', 'bug'] }, { label: ['bug', 'ui'] })).toBe(true)
    expect(sameView({ label: 'bug' }, { label: ['bug'] })).toBe(true)
    expect(sameView({ sort: 'title' }, { sort: 'title' })).toBe(true)
  })

  it('does not match when a filter key differs', () => {
    expect(sameView({ sort: 'title' }, { sort: 'priority' })).toBe(false)
    expect(sameView({ label: ['bug'] }, { label: ['bug', 'ui'] })).toBe(false)
    expect(sameView({ assignee: 'ada' }, {})).toBe(false)
  })

  it('ignores keys outside the recognized filter set', () => {
    expect(sameView({ sort: 'title', issue: '9' }, { sort: 'title' })).toBe(true)
  })
})

describe('useSavedViews', () => {
  beforeEach(() => localStorage.clear())

  it('adds a view, snapshotting only recognized filter keys', () => {
    const sv = useSavedViews(ref('grp/proj'))
    const view = sv.add('Bugs', { label: ['bug'], sort: 'priority', issue: '9' })
    expect(view).not.toBeNull()
    expect(view!.name).toBe('Bugs')
    expect(view!.query).toStrictEqual({ label: ['bug'], sort: 'priority' })
    expect(sv.views.value).toHaveLength(1)
  })

  it('persists views to per-project localStorage', async () => {
    const sv = useSavedViews(ref('grp/proj'))
    sv.add('Bugs', { label: ['bug'] })
    await nextTick() // useLocalStorage flushes the write on the next tick
    const saved = JSON.parse(localStorage.getItem(keyFor('grp/proj'))!)
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Bugs')
  })

  it('refuses to save an empty name or an empty slice', () => {
    const sv = useSavedViews(ref('grp/proj'))
    expect(sv.add('  ', { label: ['bug'] })).toBeNull()
    expect(sv.add('Empty', { issue: '9' })).toBeNull()
    expect(sv.views.value).toHaveLength(0)
  })

  it('removes a view by id', () => {
    const sv = useSavedViews(ref('grp/proj'))
    const a = sv.add('A', { sort: 'title' })!
    const b = sv.add('B', { sort: 'priority' })!
    sv.remove(a.id)
    expect(sv.views.value.map((v) => v.id)).toEqual([b.id])
  })

  it('updates a view query in place, keeping id and name', () => {
    const sv = useSavedViews(ref('grp/proj'))
    const a = sv.add('Bugs', { sort: 'title' })!
    expect(sv.update(a.id, { sort: 'priority', label: ['bug'] })).toBe(true)
    expect(sv.views.value[0]).toStrictEqual({
      id: a.id,
      name: 'Bugs',
      query: { sort: 'priority', label: ['bug'] },
    })
  })

  it('update returns false for an unknown id or an empty slice', () => {
    const sv = useSavedViews(ref('grp/proj'))
    const a = sv.add('Bugs', { sort: 'title' })!
    expect(sv.update('nope', { sort: 'priority' })).toBe(false)
    expect(sv.update(a.id, { issue: '9' })).toBe(false)
    expect(sv.views.value[0].query).toStrictEqual({ sort: 'title' })
  })

  it('renames a view, ignoring blank names', () => {
    const sv = useSavedViews(ref('grp/proj'))
    const a = sv.add('A', { sort: 'title' })!
    sv.rename(a.id, 'Renamed')
    expect(sv.views.value[0].name).toBe('Renamed')
    sv.rename(a.id, '   ')
    expect(sv.views.value[0].name).toBe('Renamed')
  })

  it('reports the active view matching the current slice', () => {
    const sv = useSavedViews(ref('grp/proj'))
    const a = sv.add('Bugs', { label: ['bug'], sort: 'priority' })!
    expect(sv.activeId({ sort: 'priority', label: ['bug'] })).toBe(a.id)
    expect(sv.activeId({ sort: 'updated' })).toBeNull()
  })

  it('keeps each project isolated and re-keys on project switch', async () => {
    const path = ref('grp/proj-a')
    const sv = useSavedViews(path)
    sv.add('A-view', { sort: 'title' })
    await nextTick() // let the write to proj-a flush before re-keying
    path.value = 'grp/proj-b'
    await nextTick()
    expect(sv.views.value).toHaveLength(0)
    expect(localStorage.getItem(keyFor('grp/proj-a'))).not.toBeNull()
  })
})
