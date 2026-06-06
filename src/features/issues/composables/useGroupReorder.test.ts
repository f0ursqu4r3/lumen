import { describe, it, expect, vi } from 'vitest'
import { useGroupReorder } from './useGroupReorder'

// Minimal DragEvent stub carrying a dataTransfer.
const dragEvent = () =>
  ({ dataTransfer: { effectAllowed: '', setData: vi.fn() } }) as unknown as DragEvent

describe('useGroupReorder', () => {
  it('tracks drag and over keys', () => {
    const r = useGroupReorder({ setOrder: vi.fn() })
    r.onReorderStart('a', dragEvent())
    expect(r.dragKey.value).toBe('a')
    r.onReorderOver('b')
    expect(r.overKey.value).toBe('b')
    expect(r.isReorderTarget('b')).toBe(true)
    expect(r.isReorderTarget('a')).toBe(false)
  })

  it('ignores dragover onto the dragged key itself', () => {
    const r = useGroupReorder({ setOrder: vi.fn() })
    r.onReorderStart('a', dragEvent())
    r.onReorderOver('a')
    expect(r.overKey.value).toBeNull()
  })

  it('persists the reordered sequence on drop and clears state', () => {
    const setOrder = vi.fn()
    const r = useGroupReorder({ setOrder })
    r.onReorderStart('a', dragEvent())
    r.onReorderOver('c')
    r.onReorderDrop('status', ['a', 'b', 'c', 'd'])
    expect(setOrder).toHaveBeenCalledWith('status', ['b', 'c', 'a', 'd'])
    expect(r.dragKey.value).toBeNull()
    expect(r.overKey.value).toBeNull()
  })

  it('does nothing on drop without a target', () => {
    const setOrder = vi.fn()
    const r = useGroupReorder({ setOrder })
    r.onReorderStart('a', dragEvent())
    r.onReorderDrop('status', ['a', 'b'])
    expect(setOrder).not.toHaveBeenCalled()
  })
})
