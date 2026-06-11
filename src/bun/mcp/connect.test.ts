import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mergeClaudeJson, mergeCodexToml } from './connect'
import { parse } from 'smol-toml'

const spawnSync = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({
  default: { spawnSync },
  spawnSync,
}))

vi.mock('../config', () => ({
  loadConfig: () => ({ mcp: { enabled: true, port: 7437, token: 'lmcp_live' } }),
}))

import { connectClaudeCode, connectCodex } from './connect'

let dir: string
beforeEach(() => {
  vi.clearAllMocks()
  dir = mkdtempSync(join(tmpdir(), 'lumen-connect-'))
  process.env.LUMEN_CLAUDE_JSON = join(dir, '.claude.json')
  process.env.LUMEN_CODEX_CONFIG = join(dir, '.codex', 'config.toml')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.LUMEN_CLAUDE_JSON
  delete process.env.LUMEN_CODEX_CONFIG
})

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

describe('connectClaudeCode', () => {
  it('shells out to `claude mcp add` when claude is on PATH', async () => {
    spawnSync.mockReturnValue({ status: 0, error: undefined })
    const res = await connectClaudeCode()
    expect(res).toEqual({ ok: true, method: 'cli' })
    const addCall = spawnSync.mock.calls.find((c) => c[1]?.[0] === 'mcp')
    expect(addCall).toBeDefined()
    expect(addCall![1]).toEqual([
      'mcp',
      'add',
      '--scope',
      'user',
      '--transport',
      'http',
      'lumen',
      'http://127.0.0.1:7437',
      '--header',
      'Authorization: Bearer lmcp_live',
    ])
  })

  it('falls back to writing ~/.claude.json when claude is absent', async () => {
    spawnSync.mockReturnValue({ status: null, error: new Error('ENOENT') })
    const res = await connectClaudeCode()
    expect(res).toEqual({ ok: true, method: 'file' })
    const doc = JSON.parse(readFileSync(process.env.LUMEN_CLAUDE_JSON!, 'utf8'))
    expect(doc.mcpServers.lumen.url).toBe('http://127.0.0.1:7437')
  })
})

describe('connectCodex', () => {
  it('writes config.toml and a .bak, merging the lumen server', async () => {
    const cfg = process.env.LUMEN_CODEX_CONFIG!
    mkdirSync(join(dir, '.codex'))
    writeFileSync(cfg, 'model = "gpt-5"\n')
    const res = await connectCodex()
    expect(res).toEqual({ ok: true, method: 'file' })
    expect(existsSync(cfg + '.bak')).toBe(true)
    const doc = parse(readFileSync(cfg, 'utf8')) as any
    expect(doc.model).toBe('gpt-5')
    expect(doc.mcp_servers.lumen.bearer_token).toBe('lmcp_live')
  })

  it('creates the .codex dir and file when none exists', async () => {
    const res = await connectCodex()
    expect(res).toEqual({ ok: true, method: 'file' })
    const doc = parse(readFileSync(process.env.LUMEN_CODEX_CONFIG!, 'utf8')) as any
    expect(doc.experimental_use_rmcp_client).toBe(true)
  })
})
