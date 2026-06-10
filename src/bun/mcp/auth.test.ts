import { describe, it, expect } from 'vitest'
import { generateToken, isAuthorized } from './auth'

const req = (auth?: string) =>
  new Request('http://127.0.0.1/', { headers: auth ? { authorization: auth } : {} })

describe('mcp auth', () => {
  it('generates a prefixed, non-trivial token', () => {
    const t = generateToken()
    expect(t).toMatch(/^lmcp_[A-Za-z0-9_-]{20,}$/)
    expect(generateToken()).not.toBe(t)
  })

  it('accepts the exact bearer token', () => {
    expect(isAuthorized(req('Bearer secret'), 'secret')).toBe(true)
  })

  it('rejects a missing, malformed, or wrong token', () => {
    expect(isAuthorized(req(), 'secret')).toBe(false)
    expect(isAuthorized(req('secret'), 'secret')).toBe(false)
    expect(isAuthorized(req('Bearer nope'), 'secret')).toBe(false)
  })
})
