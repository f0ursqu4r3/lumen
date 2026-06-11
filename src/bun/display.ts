// Pure geometry helpers for window placement. Types are a structural subset of
// electrobun's Screen.Display / Rectangle so Screen.getAllDisplays() can be
// passed in directly, while this module stays free of native imports (testable).
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Display {
  bounds: Rect
  workArea: Rect
  isPrimary: boolean
}

export interface Point {
  x: number
  y: number
}

const contains = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height

function pickDisplay(displays: Display[], anchor: Point | null): Display | null {
  if (displays.length === 0) return null
  if (anchor) {
    const hit = displays.find((d) => contains(d.bounds, anchor))
    if (hit) return hit
  }
  return displays.find((d) => d.isPrimary) ?? displays[0]
}

/** Center `size` within the work area of the display holding `anchor` (else
 *  primary, else origin). Origin is clamped to the work area's top-left. */
export function centerOn(
  size: { width: number; height: number },
  displays: Display[],
  anchor: Point | null,
): Rect {
  const target = pickDisplay(displays, anchor)
  if (!target) return { x: 0, y: 0, width: size.width, height: size.height }
  const a = target.workArea
  const x = Math.max(a.x, a.x + Math.round((a.width - size.width) / 2))
  const y = Math.max(a.y, a.y + Math.round((a.height - size.height) / 2))
  return { x, y, width: size.width, height: size.height }
}
