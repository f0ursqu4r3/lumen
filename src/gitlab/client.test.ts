import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gitlabGraphql } = vi.hoisted(() => ({ gitlabGraphql: vi.fn() }))
vi.mock('@/lib/rpc', () => ({ rpc: { gitlabGraphql } }))

import { rpcGraphqlFetch } from './client'

beforeEach(() => gitlabGraphql.mockReset())

describe('rpcGraphqlFetch', () => {
  it('forwards query+variables to RPC and returns a JSON Response with the upstream status', async () => {
    gitlabGraphql.mockResolvedValue({ status: 200, data: { ok: true }, errors: undefined })
    const res = await rpcGraphqlFetch('https://ignored/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: '{ x }', variables: { a: 1 } }),
    })
    expect(gitlabGraphql).toHaveBeenCalledWith({ query: '{ x }', variables: { a: 1 } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { ok: true }, errors: undefined })
  })

  it('propagates a 401 so graphql-request raises an auth ClientError', async () => {
    gitlabGraphql.mockResolvedValue({ status: 401, errors: [{ message: 'Unauthorized' }] })
    const res = await rpcGraphqlFetch('https://ignored/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: '{ x }' }),
    })
    expect(res.status).toBe(401)
  })
})
