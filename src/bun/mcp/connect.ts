import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse, stringify } from 'smol-toml'
import { loadConfig } from '../config'

/** Path to Claude Code's user config. Overridable via env for tests. */
export const claudeJsonPath = (): string =>
  process.env.LUMEN_CLAUDE_JSON ?? join(homedir(), '.claude.json')

/** Path to Codex's user config. Overridable via env for tests. */
export const codexConfigPath = (): string =>
  process.env.LUMEN_CODEX_CONFIG ?? join(homedir(), '.codex', 'config.toml')

/** Pure: set mcpServers.lumen to an http entry, preserving everything else. */
export function mergeClaudeJson(existing: string, url: string, token: string): string {
  const doc = (existing.trim() ? JSON.parse(existing) : {}) as Record<string, unknown>
  const servers = (doc.mcpServers ??= {}) as Record<string, unknown>
  servers.lumen = { type: 'http', url, headers: { Authorization: `Bearer ${token}` } }
  return JSON.stringify(doc, null, 2)
}

/** Pure: set [mcp_servers.lumen] + the experimental flag, preserving everything else. */
export function mergeCodexToml(existing: string, url: string, token: string): string {
  const doc = (existing.trim() ? parse(existing) : {}) as Record<string, unknown>
  doc.experimental_use_rmcp_client = true
  const servers = (doc.mcp_servers ??= {}) as Record<string, unknown>
  servers.lumen = {
    url,
    bearer_token: token,
    startup_timeout_sec: 10,
    tool_timeout_sec: 60,
  }
  return stringify(doc)
}

type ConnectResult = { ok: true; method: 'cli' | 'file' } | { ok: false; error: string }
type CodexResult = { ok: true; method: 'file' } | { ok: false; error: string }

/** Current MCP url + token, or an error string when agent access is off. */
function connection(): { url: string; token: string } | { error: string } {
  const { mcp } = loadConfig()
  if (!mcp?.enabled || !mcp.token) return { error: 'Enable agent access first.' }
  const port = mcp.port ?? 7437
  return { url: `http://127.0.0.1:${port}`, token: mcp.token }
}

function claudeOnPath(): boolean {
  const r = spawnSync('claude', ['--version'], { stdio: 'ignore' })
  return !r.error && r.status === 0
}

export async function connectClaudeCode(): Promise<ConnectResult> {
  const conn = connection()
  if ('error' in conn) return { ok: false, error: conn.error }
  try {
    if (claudeOnPath()) {
      const r = spawnSync(
        'claude',
        [
          'mcp',
          'add',
          '--scope',
          'user',
          '--transport',
          'http',
          'lumen',
          conn.url,
          '--header',
          `Authorization: Bearer ${conn.token}`,
        ],
        { stdio: 'pipe', encoding: 'utf8' },
      )
      if (r.error || r.status !== 0) {
        return { ok: false, error: (r.stderr as string | null)?.trim() || 'claude mcp add failed' }
      }
      return { ok: true, method: 'cli' }
    }
    const path = claudeJsonPath()
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, mergeClaudeJson(existing, conn.url, conn.token))
    return { ok: true, method: 'file' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'failed to connect Claude Code' }
  }
}

export async function connectCodex(): Promise<CodexResult> {
  const conn = connection()
  if ('error' in conn) return { ok: false, error: conn.error }
  try {
    const path = codexConfigPath()
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
    mkdirSync(dirname(path), { recursive: true })
    if (existing) copyFileSync(path, `${path}.bak`)
    writeFileSync(path, mergeCodexToml(existing, conn.url, conn.token))
    return { ok: true, method: 'file' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'failed to connect Codex' }
  }
}
