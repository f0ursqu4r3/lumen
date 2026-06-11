import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'smol-toml'

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
