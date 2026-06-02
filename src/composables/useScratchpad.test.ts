import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useScratchpad } from './useScratchpad'

beforeEach(() => {
  localStorage.clear()
})

describe('useScratchpad', () => {
  it('reads an existing localStorage value on init', () => {
    localStorage.setItem('tragit:scratchpad:grp/proj#9', JSON.stringify('hello'))
    const note = useScratchpad(ref('grp/proj'), ref('9'))
    expect(note.value).toBe('hello')
  })

  it('defaults to an empty string when nothing is stored', () => {
    const note = useScratchpad(ref('grp/proj'), ref('9'))
    expect(note.value).toBe('')
  })

  it('persists writes to localStorage under the issue key', async () => {
    const note = useScratchpad(ref('grp/proj'), ref('9'))
    note.value = 'remember this'
    await nextTick()
    expect(localStorage.getItem('tragit:scratchpad:grp/proj#9')).toBe(
      JSON.stringify('remember this'),
    )
  })

  it('does not collide across different iids', async () => {
    const iid = ref('9')
    const note = useScratchpad(ref('grp/proj'), iid)
    note.value = 'note for nine'
    await nextTick()

    iid.value = '10'
    await nextTick()
    expect(note.value).toBe('')

    note.value = 'note for ten'
    await nextTick()
    expect(localStorage.getItem('tragit:scratchpad:grp/proj#9')).toBe(
      JSON.stringify('note for nine'),
    )
    expect(localStorage.getItem('tragit:scratchpad:grp/proj#10')).toBe(
      JSON.stringify('note for ten'),
    )
  })
})
