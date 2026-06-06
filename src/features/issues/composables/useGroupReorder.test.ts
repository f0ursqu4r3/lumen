import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useGroupReorder } from './useGroupReorder'
import { computeInsertion } from '@/features/issues/lib/reorderGeometry'

vi.mock('@/features/issues/lib/reorderGeometry', () => ({
  computeInsertion: vi.fn(() => ({ index: 2, barOffset: 100, isNoOp: false })),
}))
const mockedCompute = vi.mocked(computeInsertion)

beforeEach(() => {
  mockedCompute.mockReturnValue({ index: 2, barOffset: 100, isNoOp: false })
  // jsdom has no rAF by default; make it a no-op so the auto-scroll loop never runs.
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

// A fake container; geometry is mocked, so only getBoundingClientRect is read
// (by the auto-scroll proximity check).
const container = {
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 300 }) as DOMRect,
  scrollLeft: 0,
  scrollTop: 0,
} as unknown as HTMLElement

const ctx = (keys: string[]) => ({ container, axis: 'x' as const, dimension: 'status', keys })
const move = (x = 50, y = 50) =>
  window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: x, clientY: y }))
const up = () => window.dispatchEvent(new Event('pointerup'))
const down = () =>
  Object.assign(new Event('pointerdown'), { clientX: 10, clientY: 10 }) as unknown as PointerEvent

describe('useGroupReorder', () => {
  it('sets activeKey on start and clears it after drop', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c', 'd']))
    expect(r.activeKey.value).toBe('a')
    move()
    up()
    expect(r.activeKey.value).toBeNull()
  })

  it('commits the reordered keys on drop', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c', 'd']))
    move()
    up()
    // computeInsertion → index 2; reorderToIndex(['a','b','c','d'],'a',2) = ['b','c','a','d']
    expect(store.setOrder).toHaveBeenCalledWith('status', ['b', 'c', 'a', 'd'])
    expect(r.justReordered.value).toBe('a')
  })

  it('does not commit a no-op drop', () => {
    mockedCompute.mockReturnValue({ index: 0, barOffset: 0, isNoOp: true })
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c']))
    move()
    up()
    expect(store.setOrder).not.toHaveBeenCalled()
    expect(r.activeKey.value).toBeNull()
  })

  it('aborts on Escape without committing', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c']))
    move()
    window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }))
    expect(store.setOrder).not.toHaveBeenCalled()
    expect(r.activeKey.value).toBeNull()
    // A late pointerup must not commit either.
    up()
    expect(store.setOrder).not.toHaveBeenCalled()
  })

  it('aborts on pointercancel', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c']))
    window.dispatchEvent(new Event('pointercancel'))
    expect(r.activeKey.value).toBeNull()
    expect(store.setOrder).not.toHaveBeenCalled()
  })

  it('tracks the cursor and bar offset on move', () => {
    const store = { setOrder: vi.fn() }
    const r = useGroupReorder(store)
    r.start('a', down(), ctx(['a', 'b', 'c']))
    move(123, 45)
    expect(r.pointer.value).toEqual({ x: 123, y: 45 })
    expect(r.barOffset.value).toBe(100)
    expect(r.insertIndex.value).toBe(2)
    up()
  })

  it('tears down listeners and the rAF loop on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const cancelSpy = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelSpy)
    const store = { setOrder: vi.fn() }
    const { api, wrapper } = withReorder(store)
    api.start('a', down(), ctx(['a', 'b', 'c']))
    move()
    wrapper.unmount()
    expect(cancelSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
    removeSpy.mockRestore()
  })
})

function withReorder(store: { setOrder: ReturnType<typeof vi.fn> }) {
  let api!: ReturnType<typeof useGroupReorder>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useGroupReorder(store)
        return () => h('div')
      },
    }),
  )
  return { api, wrapper }
}
