import { describe, it, expect, beforeEach } from 'vitest'
import { useCommandPalette } from './useCommandPalette'

describe('useCommandPalette', () => {
  beforeEach(() => useCommandPalette().close())

  it('shares one open state across callers', () => {
    const a = useCommandPalette()
    const b = useCommandPalette()
    expect(a.isOpen.value).toBe(false)
    a.open()
    expect(b.isOpen.value).toBe(true)
    b.close()
    expect(a.isOpen.value).toBe(false)
  })
})
