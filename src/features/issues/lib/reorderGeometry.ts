// Pure geometry for pointer-driven group/column reordering, plus a thin DOM
// wrapper. The pure function turns a cursor position + item rects into the
// landing index, the insertion-bar offset (in container content coordinates),
// and whether the drop would change nothing.

export interface ReorderItemRect {
  key: string
  rect: DOMRect
}

export interface InsertionResult {
  /** Landing index in the key array with the dragged key removed (0..len-1). */
  index: number
  /** Insertion-bar offset along the axis, in container content coords (px). */
  barOffset: number
  /** True when the drop lands the item back in its current position. */
  isNoOp: boolean
}

/**
 * Compute the insertion for dragging `draggedKey` to `pointer` among `items`
 * (in DOM order, including the dragged item). `axis` is 'x' for the board's
 * horizontal columns, 'y' for the list's stacked groups. `container.scroll` is
 * the scroll offset along the axis, added so the bar tracks scrolled content.
 */
export function insertionIndexFor(
  items: readonly ReorderItemRect[],
  pointer: { x: number; y: number },
  axis: 'x' | 'y',
  draggedKey: string,
  container: { rect: DOMRect; scroll: number },
): InsertionResult {
  const lead = (r: DOMRect) => (axis === 'x' ? r.left : r.top)
  const trail = (r: DOMRect) => (axis === 'x' ? r.right : r.bottom)
  const mid = (r: DOMRect) => (lead(r) + trail(r)) / 2
  const cursor = axis === 'x' ? pointer.x : pointer.y
  const origin = axis === 'x' ? container.rect.left : container.rect.top

  // gap = how many items sit (by midpoint) before the cursor, in the rendered
  // layout (dragged item included).
  let gap = 0
  for (const it of items) if (mid(it.rect) < cursor) gap++

  const draggedIndex = items.findIndex((it) => it.key === draggedKey)
  const index = gap > draggedIndex ? gap - 1 : gap
  const isNoOp = gap === draggedIndex || gap === draggedIndex + 1

  // Bar sits at the leading edge of the gap: before the first item, after the
  // last, else midway between the neighbouring item edges.
  let pos: number
  if (gap <= 0) pos = lead(items[0].rect)
  else if (gap >= items.length) pos = trail(items[items.length - 1].rect)
  else pos = (trail(items[gap - 1].rect) + lead(items[gap].rect)) / 2

  return { index, barOffset: pos - origin + container.scroll, isNoOp }
}

/** Read item rects + container box from the DOM and compute the insertion. */
export function computeInsertion(
  container: HTMLElement,
  pointer: { x: number; y: number },
  axis: 'x' | 'y',
  draggedKey: string,
): InsertionResult {
  const items: ReorderItemRect[] = Array.from(
    container.querySelectorAll<HTMLElement>('[data-reorder-key]'),
  ).map((el) => ({ key: el.dataset.reorderKey ?? '', rect: el.getBoundingClientRect() }))
  const scroll = axis === 'x' ? container.scrollLeft : container.scrollTop
  return insertionIndexFor(items, pointer, axis, draggedKey, {
    rect: container.getBoundingClientRect(),
    scroll,
  })
}
