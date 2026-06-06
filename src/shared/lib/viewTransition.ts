// Shared-element / cross-fade navigation via the View Transitions API.
//
// The picker → issues handoff (ProjectPicker.launch) established the idiom: name
// the element that should persist, then run the DOM update inside
// `document.startViewTransition` so the browser morphs old → new. This helper
// generalises that one move so every view boundary (list ⇄ board, issues ⇄
// pipelines, drawer → full page) can read as one instrument retuning rather than
// a page swap — while degrading to a plain, instant update wherever View
// Transitions are unavailable or the user prefers reduced motion.

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
}

/**
 * Run `update` (a DOM mutation — set a ref, push a route) inside a View
 * Transition when one is available and motion is allowed. `update` may be async;
 * resolve it only once the DOM reflects the new state (e.g. `await nextTick()`)
 * so the browser snapshots the finished frame. Always awaitable, always runs
 * `update` exactly once — the fallback just skips the animation.
 */
export async function withViewTransition(update: () => void | Promise<void>): Promise<void> {
  if (!supportsViewTransitions() || prefersReducedMotion()) {
    await update()
    return
  }
  const transition = document.startViewTransition(() => update())
  // Swallow the abort that fires when a transition is superseded by a faster one
  // (e.g. toggling list/board twice quickly) — the DOM update still applied.
  await transition.finished.catch(() => {})
}
