import { vi } from 'vitest'
const { gitlabGraphql, gitlabRest } = vi.hoisted(() => ({
  gitlabGraphql: vi.fn(),
  gitlabRest: vi.fn(),
}))
vi.mock('../gitlab', () => ({ gitlabGraphql, gitlabRest }))

import { describe, it, expect } from 'vitest'
import { createMcpFetch } from './server'

const TOKEN = 'itoken'
const HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2025-06-18',
  authorization: `Bearer ${TOKEN}`,
}
const post = (body: unknown, headers: Record<string, string> = HEADERS) =>
  createMcpFetch(TOKEN)(
    new Request('http://127.0.0.1/', { method: 'POST', headers, body: JSON.stringify(body) }),
  )

describe('mcp request handler (real transport)', () => {
  it('rejects requests without the bearer token', async () => {
    const res = await post(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { 'content-type': 'application/json' },
    )
    expect(res.status).toBe(401)
  })

  it('negotiates initialize', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.result.serverInfo.name).toBe('lumen')
  })

  it('answers tools/list', async () => {
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    const json = await res.json()
    expect(Array.isArray(json.result.tools)).toBe(true)
  })

  it('lists the gitlab tools and calls one end-to-end', async () => {
    const list = await (
      await post({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })
    ).json()
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain('lumen_me')

    gitlabGraphql.mockResolvedValue({ status: 200, data: { currentUser: { username: 'ana' } } })
    const call = await (
      await post({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'lumen_me', arguments: {} },
      })
    ).json()
    expect(call.result.content[0].text).toContain('ana')
  })
})
