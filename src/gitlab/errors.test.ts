import { describe, it, expect } from 'vitest'
import { ClientError } from 'graphql-request'
import { normalizeError } from './errors'

const clientError = (status: number, errors: { message: string }[] = []) =>
  new ClientError(
    { status, errors, data: null, headers: new Headers() } as never,
    { query: '' } as never,
  )

describe('normalizeError', () => {
  it('maps 401 to an auth error with a .env hint', () => {
    const e = normalizeError(clientError(401))
    expect(e.kind).toBe('auth')
    expect(e.message).toMatch(/GITLAB_TOKEN/)
  })

  it('maps a 403 that carries a GraphQL error body to auth (real token rejection)', () => {
    expect(normalizeError(clientError(403, [{ message: 'insufficient_scope' }])).kind).toBe('auth')
  })

  it('maps a bodyless 403 to unavailable (edge/LB block, e.g. off-VPN — not the token)', () => {
    expect(normalizeError(clientError(403)).kind).toBe('unavailable')
  })

  it('surfaces the first GraphQL error message', () => {
    const e = normalizeError(clientError(200, [{ message: 'Field x not found' }]))
    expect(e.kind).toBe('graphql')
    expect(e.message).toBe('Field x not found')
  })

  it('maps 5xx to an unavailable error', () => {
    expect(normalizeError(clientError(500)).kind).toBe('unavailable')
    expect(normalizeError(clientError(503)).kind).toBe('unavailable')
  })

  it('maps a non-5xx ClientError with no GraphQL errors to network', () => {
    expect(normalizeError(clientError(404)).kind).toBe('network')
  })

  it('falls back to the message for a plain Error', () => {
    const e = normalizeError(new Error('boom'))
    expect(e).toEqual({ kind: 'unknown', message: 'boom' })
  })
})
