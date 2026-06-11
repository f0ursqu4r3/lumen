import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useIssueSelection } from './useIssueSelection'

describe('useIssueSelection', () => {
  it('toggles iids in and out of the set', () => {
    const s = useIssueSelection(ref('grp/proj'))
    s.toggle('7')
    expect(s.isSelected('7')).toBe(true)
    expect(s.count.value).toBe(1)
    s.toggle('7')
    expect(s.isSelected('7')).toBe(false)
    expect(s.count.value).toBe(0)
  })

  it('selectAll replaces the set; clear empties it', () => {
    const s = useIssueSelection(ref('grp/proj'))
    s.selectAll(['1', '2', '3'])
    expect(s.count.value).toBe(3)
    s.clear()
    expect(s.count.value).toBe(0)
  })

  it('setMany adds and removes a batch without touching the rest', () => {
    const s = useIssueSelection(ref('grp/proj'))
    s.toggle('9')
    s.setMany(['1', '2'], true)
    expect([...s.selected.value].sort()).toEqual(['1', '2', '9'])
    s.setMany(['1', '2'], false)
    expect([...s.selected.value]).toEqual(['9'])
  })

  it('setMode(false) and exit() both clear the selection and turn mode off', () => {
    const s = useIssueSelection(ref('grp/proj'))
    s.setMode(true)
    s.toggle('1')
    s.exit()
    expect(s.mode.value).toBe(false)
    expect(s.count.value).toBe(0)
  })

  it('clears selection and mode when fullPath changes', async () => {
    const fullPath = ref('grp/a')
    const s = useIssueSelection(fullPath)
    s.setMode(true)
    s.toggle('1')
    fullPath.value = 'grp/b'
    await nextTick()
    expect(s.count.value).toBe(0)
    expect(s.mode.value).toBe(false)
  })

  it('useInjectedSelection returns a disabled fallback when not provided', async () => {
    const { useInjectedSelection } = await import('./useIssueSelection')
    const s = useInjectedSelection()
    expect(s.mode.value).toBe(false)
    s.toggle('1') // no-op, must not throw
    expect(s.isSelected('1')).toBe(false)
  })
})
