import { describe, it, expect } from 'vitest'
import { mergeClaudeJson, mergeCodexToml } from './connect'
import { parse } from 'smol-toml'

describe('mergeClaudeJson', () => {
  it('adds an http lumen server to an empty config', () => {
    const out = JSON.parse(mergeClaudeJson('', 'http://127.0.0.1:7437', 'lmcp_x'))
    expect(out.mcpServers.lumen).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:7437',
      headers: { Authorization: 'Bearer lmcp_x' },
    })
  })

  it('preserves unrelated keys and other servers, overwriting only lumen', () => {
    const existing = JSON.stringify({
      numStartups: 3,
      mcpServers: { other: { type: 'stdio', command: 'x' }, lumen: { url: 'old' } },
    })
    const out = JSON.parse(mergeClaudeJson(existing, 'http://127.0.0.1:7437', 'lmcp_new'))
    expect(out.numStartups).toBe(3)
    expect(out.mcpServers.other).toEqual({ type: 'stdio', command: 'x' })
    expect(out.mcpServers.lumen.headers.Authorization).toBe('Bearer lmcp_new')
  })
})

describe('mergeCodexToml', () => {
  it('adds the experimental flag and lumen server to an empty config', () => {
    const doc = parse(mergeCodexToml('', 'http://127.0.0.1:7437', 'lmcp_x')) as any
    expect(doc.experimental_use_rmcp_client).toBe(true)
    expect(doc.mcp_servers.lumen).toEqual({
      url: 'http://127.0.0.1:7437',
      bearer_token: 'lmcp_x',
      startup_timeout_sec: 10,
      tool_timeout_sec: 60,
    })
  })

  it('preserves unrelated keys and other servers, overwriting only lumen', () => {
    const existing = [
      'model = "gpt-5"',
      '',
      '[mcp_servers.other]',
      'command = "x"',
      '',
      '[mcp_servers.lumen]',
      'url = "old"',
    ].join('\n')
    const doc = parse(mergeCodexToml(existing, 'http://127.0.0.1:7437', 'lmcp_new')) as any
    expect(doc.model).toBe('gpt-5')
    expect(doc.mcp_servers.other.command).toBe('x')
    expect(doc.mcp_servers.lumen.bearer_token).toBe('lmcp_new')
    expect(doc.mcp_servers.lumen.url).toBe('http://127.0.0.1:7437')
  })
})
