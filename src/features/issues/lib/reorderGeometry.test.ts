import { describe, it, expect } from 'vitest'
import { insertionIndexFor, type ReorderItemRect } from './reorderGeometry'

// Three 100px-wide items at x=[0,100],[110,210],[220,320]; midpoints 50/160/270.
const rect = (left: number, width: number): DOMRect =>
  ({ left, right: left + width, top: 0, bottom: 100, width, height: 100, x: left, y: 0 }) as DOMRect
const itemsX: ReorderItemRect[] = [
  { key: 'a', rect: rect(0, 100) },
  { key: 'b', rect: rect(110, 100) },
  { key: 'c', rect: rect(220, 100) },
]
const container = { rect: rect(0, 320), scroll: 0 }

describe('insertionIndexFor (x axis)', () => {
  it('drops at the end when the cursor is past the last midpoint', () => {
    const r = insertionIndexFor(itemsX, { x: 300, y: 50 }, 'x', 'a', container)
    expect(r.index).toBe(2)
    expect(r.isNoOp).toBe(false)
    expect(r.barOffset).toBeCloseTo(320)
  })

  it('drops between two items', () => {
    const r = insertionIndexFor(itemsX, { x: 165, y: 50 }, 'x', 'a', container)
    expect(r.index).toBe(1)
    expect(r.isNoOp).toBe(false)
    expect(r.barOffset).toBeCloseTo(215)
  })

  it('flags a no-op when dropping the item onto its own slot', () => {
    const before = insertionIndexFor(itemsX, { x: 40, y: 50 }, 'x', 'a', container)
    expect(before.isNoOp).toBe(true)
    const after = insertionIndexFor(itemsX, { x: 80, y: 50 }, 'x', 'a', container)
    expect(after.isNoOp).toBe(true)
  })

  it('computes index relative to the dragged item being removed', () => {
    const r = insertionIndexFor(itemsX, { x: 40, y: 50 }, 'x', 'b', container)
    expect(r.index).toBe(0)
    expect(r.isNoOp).toBe(false)
  })

  it('adds container scroll to the bar offset', () => {
    const r = insertionIndexFor(itemsX, { x: 165, y: 50 }, 'x', 'a', { rect: rect(0, 320), scroll: 30 })
    expect(r.barOffset).toBeCloseTo(245)
  })
})

// Vertical variant: stack three 40px-tall rows at y=[0,40],[50,90],[100,140].
const rectY = (top: number, height: number): DOMRect =>
  ({ left: 0, right: 200, top, bottom: top + height, width: 200, height, x: 0, y: top }) as DOMRect
const itemsY: ReorderItemRect[] = [
  { key: 'a', rect: rectY(0, 40) },
  { key: 'b', rect: rectY(50, 40) },
  { key: 'c', rect: rectY(100, 40) },
]
const containerY = { rect: rectY(0, 140), scroll: 0 }

describe('insertionIndexFor (y axis)', () => {
  it('drops between rows by vertical midpoint', () => {
    // midpoints 20/70/120; cursor at 75 is past a(20) and b(70) → gap 2
    const r = insertionIndexFor(itemsY, { x: 10, y: 75 }, 'y', 'a', containerY)
    expect(r.index).toBe(1)
    expect(r.isNoOp).toBe(false)
    expect(r.barOffset).toBeCloseTo(95) // between b.bottom(90) and c.top(100)
  })

  it('drops at the top', () => {
    const r = insertionIndexFor(itemsY, { x: 10, y: 5 }, 'y', 'c', containerY)
    expect(r.index).toBe(0)
    expect(r.barOffset).toBeCloseTo(0)
  })
})
