import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gitlabRest } = vi.hoisted(() => ({ gitlabRest: vi.fn() }))
vi.mock('@/shared/lib/rpc', () => ({ rpc: { gitlabRest } }))

import { restGet, restPost } from './rest'

beforeEach(() => gitlabRest.mockReset())

describe('rest over RPC', () => {
  it('GET parses a JSON body', async () => {
    gitlabRest.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: JSON.stringify({ id: 7 }),
    })
    expect(await restGet('/projects/7')).toEqual({ id: 7 })
    expect(gitlabRest).toHaveBeenCalledWith({ method: 'GET', path: '/v4/projects/7' })
  })

  it('returns null for an empty body', async () => {
    gitlabRest.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', body: '' })
    expect(await restPost('/projects/7/star')).toBeNull()
  })

  it('maps 401 to an auth error', async () => {
    gitlabRest.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', body: '' })
    await expect(restGet('/projects/7')).rejects.toMatchObject({ kind: 'auth' })
  })

  it('maps 5xx to an unavailable error', async () => {
    gitlabRest.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      body: '',
    })
    await expect(restGet('/projects/7')).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('maps other non-ok statuses to a network error', async () => {
    gitlabRest.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found', body: '' })
    await expect(restGet('/projects/7')).rejects.toMatchObject({ kind: 'network' })
  })
})
