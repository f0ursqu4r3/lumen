import { onScopeDispose, reactive, ref, watch, nextTick, type Ref } from 'vue'

export function useSpringCursor(opts: {
  count: Ref<number>
  listEl: Ref<HTMLElement | null>
  resetKey: Ref<unknown> // changing it resets to top + snaps (the search string)
  rows: Ref<{ fullPath: string }[]> // the flat row list, to pin/clamp on change
}) {
  const active = ref(0)
  const reduce =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const cursor = reactive({ y: 0, h: 0, visible: false })
  const pinTo = ref<string | null>(null)
  let velocity = 0
  let raf = 0
  let lastTs = 0

  const rowAt = (i: number) =>
    opts.listEl.value?.querySelectorAll<HTMLElement>('[data-row]')[i] ?? null

  function springTo(snap = false) {
    const el = rowAt(active.value)
    if (!el) {
      cursor.visible = false
      return
    }
    cursor.visible = true
    cursor.h = el.offsetHeight
    const target = el.offsetTop
    cancelAnimationFrame(raf)

    if (snap || reduce?.matches) {
      cursor.y = target
      velocity = 0
      return
    }

    lastTs = performance.now()
    const step = (now: number) => {
      const dt = Math.min((now - lastTs) / 1000, 1 / 30)
      lastTs = now
      // stiffness/damping tuned just past critical: snappy arrival, no overshoot.
      const accel = -210 * (cursor.y - target) - 30 * velocity
      velocity += accel * dt
      cursor.y += velocity * dt
      if (Math.abs(cursor.y - target) < 0.3 && Math.abs(velocity) < 0.3) {
        cursor.y = target
        velocity = 0
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }

  function move(delta: number) {
    if (!opts.count.value) return
    active.value = Math.max(0, Math.min(opts.count.value - 1, active.value + delta))
    rowAt(active.value)?.scrollIntoView({ block: 'nearest' })
  }

  // Glide whenever the cursor target changes.
  watch(active, () => springTo())

  // A new search is a new context — reset to the top and snap (no glide across a
  // list that just changed underneath). Appended pages must NOT reset the cursor.
  watch(opts.resetKey, () => {
    active.value = 0
    nextTick(() => springTo(true))
  })

  // The row set changed: first data, an appended page, or a star toggle that hops a
  // project between sections. Keep the selection on the same project where we can
  // (`pinTo`), clamp it in range, then (re)place the rail.
  watch(opts.rows, (rows, prev) => {
    if (pinTo.value) {
      const i = rows.findIndex((r) => r.fullPath === pinTo.value)
      if (i >= 0) active.value = i
      pinTo.value = null
    }
    if (active.value > rows.length - 1) active.value = Math.max(0, rows.length - 1)
    nextTick(() => springTo((prev?.length ?? 0) === 0))
  })

  onScopeDispose(() => cancelAnimationFrame(raf))

  return { active, cursor, pinTo, springTo, move }
}
