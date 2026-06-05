import { describe, it, expect, afterEach, vi } from 'vitest'
import { isAppActive } from './appActive'

function stub(visibility: DocumentVisibilityState, focused: boolean) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visibility)
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused)
}

afterEach(() => vi.restoreAllMocks())

describe('isAppActive', () => {
  it('is true only when visible and focused', () => {
    stub('visible', true)
    expect(isAppActive()).toBe(true)
  })

  it('is false when the window is not focused', () => {
    stub('visible', false)
    expect(isAppActive()).toBe(false)
  })

  it('is false when the document is hidden (minimized/occluded)', () => {
    stub('hidden', true)
    expect(isAppActive()).toBe(false)
  })
})
