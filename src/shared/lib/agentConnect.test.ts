import { describe, it, expect } from 'vitest'
import { buildConnect } from './agentConnect'

const FIX = { host: '127.0.0.1', port: 7437, token: 'lmcp_abc123' }

describe('buildConnect', () => {
  it('builds the Claude Code CLI command with scope, transport, url and bearer header', () => {
    const { claude } = buildConnect(FIX)
    expect(claude.cli).toBe(
      'claude mcp add --scope user --transport http lumen http://127.0.0.1:7437 --header "Authorization: Bearer lmcp_abc123"',
    )
  })

  it('builds a .mcp.json block with an http lumen server', () => {
    const { claude } = buildConnect(FIX)
    expect(JSON.parse(claude.json)).toEqual({
      mcpServers: {
        lumen: {
          type: 'http',
          url: 'http://127.0.0.1:7437',
          headers: { Authorization: 'Bearer lmcp_abc123' },
        },
      },
    })
  })

  it('builds Codex toml with the experimental flag and a [mcp_servers.lumen] table', () => {
    const { codex } = buildConnect(FIX)
    expect(codex.toml).toContain('experimental_use_rmcp_client = true')
    expect(codex.toml).toContain('[mcp_servers.lumen]')
    expect(codex.toml).toContain('url = "http://127.0.0.1:7437"')
    expect(codex.toml).toContain('bearer_token = "lmcp_abc123"')
    expect(codex.toml).toContain('startup_timeout_sec = 10')
    expect(codex.toml).toContain('tool_timeout_sec = 60')
  })

  it('exposes raw url and header for other clients', () => {
    const { raw } = buildConnect(FIX)
    expect(raw.url).toBe('http://127.0.0.1:7437')
    expect(raw.header).toBe('Authorization: Bearer lmcp_abc123')
  })
})
