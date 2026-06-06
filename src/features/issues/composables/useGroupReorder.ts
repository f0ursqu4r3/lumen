import { onUnmounted, ref } from 'vue'
import { reorderToIndex } from '@/features/issues/lib/issueView'
import { computeInsertion } from '@/features/issues/lib/reorderGeometry'

interface OrderStore {
  setOrder: (dimension: string, keys: string[]) => void
}

export interface ReorderContext {
  container: HTMLElement
  axis: 'x' | 'y'
  dimension: string
  keys: string[]
}

// Cursor distance from a container edge that triggers auto-scroll, and the max
// per-frame scroll step.
const EDGE = 48
const MAX_STEP = 18

/**
 * Pointer-driven reordering of list groups / board columns. Owns drag state,
 * geometry, edge auto-scroll, and commit; renders nothing — the components draw
 * the ghost chip and insertion bar from this state. Card drag-and-drop is a
 * separate, native interaction and is unaffected.
 */
export function useGroupReorder(store: OrderStore) {
  const activeKey = ref<string | null>(null)
  const insertIndex = ref<number | null>(null)
  const pointer = ref<{ x: number; y: number } | null>(null)
  const barOffset = ref<number | null>(null)
  const justReordered = ref<string | null>(null)

  let ctx: ReorderContext | null = null
  let isNoOp = true
  let raf = 0
  let scrollDir = 0
  let settleTimer: ReturnType<typeof setTimeout> | undefined

  function recompute() {
    if (!ctx || !pointer.value || !activeKey.value) return
    const r = computeInsertion(ctx.container, pointer.value, ctx.axis, activeKey.value)
    insertIndex.value = r.index
    barOffset.value = r.barOffset
    isNoOp = r.isNoOp
  }

  function onMove(e: PointerEvent) {
    if (!ctx) return
    pointer.value = { x: e.clientX, y: e.clientY }
    recompute()
    const box = ctx.container.getBoundingClientRect()
    const c = ctx.axis === 'x' ? e.clientX : e.clientY
    const lo = (ctx.axis === 'x' ? box.left : box.top) + EDGE
    const hi = (ctx.axis === 'x' ? box.right : box.bottom) - EDGE
    scrollDir = c < lo ? -1 : c > hi ? 1 : 0
  }

  // The rAF loop intentionally re-requests every frame during a drag (even when
  // scrollDir === 0) so it is always ready to respond to direction changes
  // without needing to restart. The overhead is negligible for a short-lived drag.
  function tick() {
    if (ctx && scrollDir !== 0) {
      if (ctx.axis === 'x') ctx.container.scrollLeft += scrollDir * MAX_STEP
      else ctx.container.scrollTop += scrollDir * MAX_STEP
      recompute()
    }
    raf = requestAnimationFrame(tick)
  }

  function onUp() {
    const c = ctx
    const key = activeKey.value
    const idx = insertIndex.value
    const noop = isNoOp
    cleanup()
    if (!c || !key || idx == null || noop) return
    store.setOrder(c.dimension, reorderToIndex(c.keys, key, idx))
    justReordered.value = key
    settleTimer = setTimeout(() => (justReordered.value = null), 400)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') cleanup()
  }

  function cleanup() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', cleanup)
    window.removeEventListener('keydown', onKey)
    cancelAnimationFrame(raf)
    raf = 0
    scrollDir = 0
    ctx = null
    isNoOp = true
    activeKey.value = null
    insertIndex.value = null
    pointer.value = null
    barOffset.value = null
    clearTimeout(settleTimer)
    settleTimer = undefined
  }

  function start(key: string, e: PointerEvent, context: ReorderContext) {
    if (ctx !== null) return
    ctx = context
    activeKey.value = key
    pointer.value = { x: e.clientX, y: e.clientY }
    isNoOp = true
    insertIndex.value = null
    barOffset.value = null
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cleanup)
    window.addEventListener('keydown', onKey)
    raf = requestAnimationFrame(tick)
  }

  onUnmounted(() => {
    cleanup()
  })

  return { activeKey, insertIndex, pointer, barOffset, justReordered, start }
}
