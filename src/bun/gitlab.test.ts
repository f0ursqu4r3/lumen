// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildGraphql, buildRest, buildAsset, buildUpload } from './gitlab'

const { loadConfig } = vi.hoisted(() => ({ loadConfig: vi.fn() }))
vi.mock('./config', () => ({ loadConfig }))

const { observe, isProbing } = vi.hoisted(() => ({
  observe: vi.fn(),
  isProbing: vi.fn(() => false),
}))
vi.mock('./serverHealth', () => ({
  observe,
  isProbing,
  classifyStatus: (status: number, hasBody: boolean) =>
    status === 401 || (status === 403 && hasBody)
      ? 'auth'
      : status >= 500 || status === 403
        ? 'down'
        : 'ok',
}))

import { gitlabGraphql, gitlabRest, gitlabUpload, clearGitlabReadCache } from './gitlab'
import { PROBE_QUERY } from '@/shared/lib/gitlabQueries'

// The read cache is module-level state; start every test from a clean slate so a
// success cached in one test can't satisfy (and silence the fetch/observe in)
// the next.
beforeEach(() => clearGitlabReadCache())

const cfg = { gitlabUrl: 'https://gl.example.com', token: 'glpat-xyz' }

// A fresh Response per call — a body can only be read once, and these mocks back
// multiple fetches.
const ok200 = () =>
  vi.fn(async () => new Response(JSON.stringify({ data: { v: 1 } }), { status: 200 }))

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

  it('builds a multipart upload POST with token + TLS-off', async () => {
    const { url, init } = buildUpload(cfg, {
      fullPath: 'group/app',
      filename: 'log.txt',
      contentType: 'text/plain',
      dataBase64: Buffer.from('hello').toString('base64'),
    })
    expect(url).toBe('https://gl.example.com/api/v4/projects/group%2Fapp/uploads')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-xyz')
    // Content-Type is NOT set: fetch derives the multipart boundary from FormData.
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    expect((init as { tls?: { rejectUnauthorized?: boolean } }).tls?.rejectUnauthorized).toBe(false)
    const body = init.body as FormData
    const file = body.get('file') as File
    expect(file.name).toBe('log.txt')
    expect(file.type).toBe('text/plain')
    expect(await file.text()).toBe('hello')
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

  it('returns markdown + ok on a successful upload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          markdown: '![x](/uploads/abc/x.png)',
          url: '/uploads/abc/x.png',
          alt: 'x',
        }),
      }),
    )
    const res = await gitlabUpload({
      fullPath: 'g/a',
      filename: 'x.png',
      contentType: 'image/png',
      dataBase64: 'AA==',
    })
    expect(res.ok).toBe(true)
    expect(res.status).toBe(201)
    expect(res.markdown).toBe('![x](/uploads/abc/x.png)')
  })

  it('returns ok:false with status on an upload failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 413, json: async () => ({}) }),
    )
    const res = await gitlabUpload({
      fullPath: 'g/a',
      filename: 'big.zip',
      contentType: 'application/zip',
      dataBase64: 'AA==',
    })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(413)
    expect(res.markdown).toBeUndefined()
  })
})

describe('gitlab feeds server-health', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ gitlabUrl: 'https://gl.example.com', token: 't' })
    observe.mockReset()
    isProbing.mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observes "down" on a transport failure (503 sentinel)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await gitlabGraphql({ query: '{x}' })
    expect(observe).toHaveBeenCalledWith('down')
  })

  it('observes "ok" on a clean 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 })),
    )
    await gitlabGraphql({ query: '{x}' })
    expect(observe).toHaveBeenCalledWith('ok')
  })

  it('does NOT observe while a probe is in flight (no feedback loop)', async () => {
    isProbing.mockReturnValue(true)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 })),
    )
    await gitlabGraphql({ query: '{x}' })
    expect(observe).not.toHaveBeenCalled()
  })

  it('observes "auth" on a REST 403 with a JSON body (real token rejection)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: '403 Forbidden' }), {
          status: 403,
          statusText: 'Forbidden',
        }),
      ),
    )
    await gitlabRest({ method: 'GET', path: '/v4/x' })
    expect(observe).toHaveBeenCalledWith('auth')
  })

  it('observes "down" on a bodyless REST 403 (edge/LB block)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 403, statusText: 'Forbidden' })),
    )
    await gitlabRest({ method: 'GET', path: '/v4/x' })
    expect(observe).toHaveBeenCalledWith('down')
  })

  it('does NOT observe a silent request, even on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    await gitlabGraphql({ query: '{x}', silent: true })
    expect(observe).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('observes "ok" on a successful upload (201)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ markdown: '' }) }),
    )
    await gitlabUpload({
      fullPath: 'g/a',
      filename: 'x.png',
      contentType: 'image/png',
      dataBase64: 'AA==',
    })
    expect(observe).toHaveBeenCalledWith('ok')
  })

  it('observes "down" on an upload transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await gitlabUpload({
      fullPath: 'g/a',
      filename: 'x.png',
      contentType: 'image/png',
      dataBase64: 'AA==',
    })
    expect(observe).toHaveBeenCalledWith('down')
  })
})

describe('cross-window read cache', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ gitlabUrl: 'https://gl.example.com', token: 't' })
    isProbing.mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('serves a repeated identical read from cache (one upstream fetch)', async () => {
    const fetch = ok200()
    vi.stubGlobal('fetch', fetch)
    await gitlabGraphql({ query: '{ a }' })
    await gitlabGraphql({ query: '{ a }' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent identical reads into a single fetch', async () => {
    const fetch = ok200()
    vi.stubGlobal('fetch', fetch)
    await Promise.all([gitlabGraphql({ query: '{ a }' }), gitlabGraphql({ query: '{ a }' })])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keys the cache by variables (different vars → separate fetches)', async () => {
    const fetch = ok200()
    vi.stubGlobal('fetch', fetch)
    await gitlabGraphql({ query: '{ a }', variables: { id: 1 } })
    await gitlabGraphql({ query: '{ a }', variables: { id: 2 } })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never caches the reachability probe (always hits upstream)', async () => {
    const fetch = ok200()
    vi.stubGlobal('fetch', fetch)
    await gitlabGraphql({ query: PROBE_QUERY })
    await gitlabGraphql({ query: PROBE_QUERY })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('bypasses the cache for silent reads', async () => {
    const fetch = ok200()
    vi.stubGlobal('fetch', fetch)
    await gitlabGraphql({ query: '{ a }', silent: true })
    await gitlabGraphql({ query: '{ a }', silent: true })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('busts the cache after a mutation so the next read refetches', async () => {
    const fetch = ok200()
    vi.stubGlobal('fetch', fetch)
    await gitlabGraphql({ query: '{ a }' }) // fetch #1, cached
    await gitlabGraphql({ query: '{ a }' }) // cache hit
    await gitlabGraphql({ query: 'mutation M { go }' }) // fetch #2, busts cache
    await gitlabGraphql({ query: '{ a }' }) // fetch #3 (cache empty)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not cache a failed read (next identical read retries)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await gitlabGraphql({ query: '{ a }' })
    await gitlabGraphql({ query: '{ a }' })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('caches REST GETs but a write busts the cache', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await gitlabRest({ method: 'GET', path: '/v4/x' }) // fetch #1, cached
    await gitlabRest({ method: 'GET', path: '/v4/x' }) // cache hit
    await gitlabRest({ method: 'POST', path: '/v4/x/star' }) // fetch #2, busts cache
    await gitlabRest({ method: 'GET', path: '/v4/x' }) // fetch #3
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('refetches once the cache entry passes its TTL', async () => {
    vi.useFakeTimers()
    const fetch = ok200()
    vi.stubGlobal('fetch', fetch)
    await gitlabGraphql({ query: '{ a }' })
    vi.setSystemTime(Date.now() + 26_000) // TTL is 25s
    await gitlabGraphql({ query: '{ a }' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
