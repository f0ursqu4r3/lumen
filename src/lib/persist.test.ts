import { describe, it, expect, beforeEach } from 'vitest'
import { makeBuster, PERSIST_KEY, clearPersistedCache } from './persist'

beforeEach(() => localStorage.clear())

describe('makeBuster', () => {
  it('is stable for the same url', () => {
    expect(makeBuster('https://gl.example.com')).toBe(makeBuster('https://gl.example.com'))
  })
  it('differs across instances so switching clears stale cache', () => {
    expect(makeBuster('https://a.example.com')).not.toBe(makeBuster('https://b.example.com'))
  })
  it('has a stable buster for the unconfigured (null) state', () => {
    expect(makeBuster(null)).toBe(makeBuster(null))
  })
})

describe('clearPersistedCache', () => {
  it('removes the persisted query cache entry', () => {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ stale: true }))
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull()
    clearPersistedCache()
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()
  })

  it('is a no-op when nothing is stored', () => {
    expect(() => clearPersistedCache()).not.toThrow()
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()
  })
})
