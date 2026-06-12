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

  it('lists the app/current resource (resources/list is not method-not-found)', async () => {
    const res = await post({ jsonrpc: '2.0', id: 5, method: 'resources/list', params: {} })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeUndefined()
    const uris = json.result.resources.map((r: { uri: string }) => r.uri)
    expect(uris).toContain('lumen://app/current')
  })

  it('lists the issue and merge-request resource templates', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 6,
      method: 'resources/templates/list',
      params: {},
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeUndefined()
    const templates = json.result.resourceTemplates.map(
      (t: { uriTemplate: string }) => t.uriTemplate,
    )
    expect(templates).toContain('lumen://issue/{+projectPath}/{iid}')
    expect(templates).toContain('lumen://mr/{+projectPath}/{iid}')
  })

  it('reads lumen://app/current (mirrors app state; null before the app reports)', async () => {
    const res = await post({
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: { uri: 'lumen://app/current' },
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeUndefined()
    const content = json.result.contents[0]
    expect(content.uri).toBe('lumen://app/current')
    expect(JSON.parse(content.text)).toEqual({ snapshot: null, windows: [] })
  })

  it('reads an issue via lumen://issue/{+projectPath}/{iid} with a multi-segment path', async () => {
    gitlabGraphql.mockResolvedValue({
      status: 200,
      data: { project: { issue: { iid: '42', title: 'Hello' } } },
    })
    const res = await post({
      jsonrpc: '2.0',
      id: 8,
      method: 'resources/read',
      params: { uri: 'lumen://issue/group/sub/repo/42' },
    })
    const json = await res.json()
    expect(json.error).toBeUndefined()
    const content = json.result.contents[0]
    expect(content.uri).toBe('lumen://issue/group/sub/repo/42')
    expect(JSON.parse(content.text)).toMatchObject({ iid: '42', title: 'Hello' })
    // The greedy {+projectPath} captures everything before the trailing numeric iid.
    expect(gitlabGraphql.mock.calls.at(-1)![0].variables).toMatchObject({
      p: 'group/sub/repo',
      iid: '42',
    })
  })

  it('reads a merge request via lumen://mr/{+projectPath}/{iid}', async () => {
    gitlabGraphql.mockResolvedValue({
      status: 200,
      data: { project: { mergeRequest: { iid: '7', title: 'MR' } } },
    })
    const res = await post({
      jsonrpc: '2.0',
      id: 9,
      method: 'resources/read',
      params: { uri: 'lumen://mr/group/repo/7' },
    })
    const json = await res.json()
    expect(json.error).toBeUndefined()
    const content = json.result.contents[0]
    expect(content.uri).toBe('lumen://mr/group/repo/7')
    expect(JSON.parse(content.text)).toMatchObject({ iid: '7', title: 'MR' })
    expect(gitlabGraphql.mock.calls.at(-1)![0].variables).toMatchObject({
      p: 'group/repo',
      iid: '7',
    })
  })

  it('rejects an issue resource read with a non-numeric iid before hitting GitLab', async () => {
    gitlabGraphql.mockClear()
    const res = await post({
      jsonrpc: '2.0',
      id: 14,
      method: 'resources/read',
      params: { uri: 'lumen://issue/group/repo/not-a-number' },
    })
    const json = await res.json()
    expect(json.error).toBeDefined()
    expect(json.error.message).toMatch(/iid/i)
    expect(gitlabGraphql).not.toHaveBeenCalled()
  })

  it('regression: initialize + tools/list + resource discovery all return valid responses', async () => {
    const init = await (
      await post({
        jsonrpc: '2.0',
        id: 10,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
      })
    ).json()
    expect(init.result.serverInfo.name).toBe('lumen')

    const tools = await (
      await post({ jsonrpc: '2.0', id: 11, method: 'tools/list', params: {} })
    ).json()
    expect(tools.error).toBeUndefined()
    expect(Array.isArray(tools.result.tools)).toBe(true)

    const resources = await (
      await post({ jsonrpc: '2.0', id: 12, method: 'resources/list', params: {} })
    ).json()
    expect(resources.error).toBeUndefined()
    expect(resources.result.resources.map((r: { uri: string }) => r.uri)).toContain(
      'lumen://app/current',
    )

    const templates = await (
      await post({ jsonrpc: '2.0', id: 13, method: 'resources/templates/list', params: {} })
    ).json()
    expect(templates.error).toBeUndefined()
    expect(
      templates.result.resourceTemplates.map((t: { uriTemplate: string }) => t.uriTemplate),
    ).toEqual(
      expect.arrayContaining([
        'lumen://issue/{+projectPath}/{iid}',
        'lumen://mr/{+projectPath}/{iid}',
      ]),
    )
  })

  it('lists the gitlab tools and calls one end-to-end', async () => {
    const list = await (
      await post({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })
    ).json()
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain('lumen_me')
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain('lumen_app_state')

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
