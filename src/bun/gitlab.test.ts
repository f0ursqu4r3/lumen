import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildGraphql, buildRest, buildAsset } from './gitlab'

const { loadConfig } = vi.hoisted(() => ({ loadConfig: vi.fn() }))
vi.mock('./config', () => ({ loadConfig }))

import { gitlabGraphql, gitlabRest } from './gitlab'

const cfg = { gitlabUrl: 'https://gl.example.com', token: 'glpat-xyz' }

describe('gitlab request builders', () => {
  it('builds a graphql POST with token + TLS-off', () => {
    const { url, init } = buildGraphql(cfg, { query: '{ x }', variables: { a: 1 } })
    expect(url).toBe('https://gl.example.com/api/graphql')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-xyz')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ query: '{ x }', variables: { a: 1 } }))
    expect((init as { tls?: { rejectUnauthorized?: boolean } }).tls?.rejectUnauthorized).toBe(false)
  })

  it('builds a REST request against /api with token', () => {
    const { url, init } = buildRest(cfg, { method: 'POST', path: '/v4/projects/1/star' })
    expect(url).toBe('https://gl.example.com/api/v4/projects/1/star')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-xyz')
  })

  it('builds an asset request against /api with token', () => {
    const { url, init } = buildAsset(cfg, { path: '/v4/projects/1/uploads/abc/x.png' })
    expect(url).toBe('https://gl.example.com/api/v4/projects/1/uploads/abc/x.png')
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-xyz')
  })
})

describe('host transport-failure handling', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ gitlabUrl: 'https://gl.example.com', token: 't' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a 503 sentinel when the graphql fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const res = await gitlabGraphql({ query: '{ x }' })
    expect(res.status).toBe(503)
    expect(res.errors?.[0]?.message).toBe('GitLab is unreachable')
  })

  it('returns ok:false status 503 when the rest fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))
    const res = await gitlabRest({ method: 'GET', path: '/v4/projects/7' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(503)
  })
})
