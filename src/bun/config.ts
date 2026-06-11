import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'

export interface McpConfig {
  enabled: boolean
  port: number
  token: string | null
}

export interface AppConfig {
  gitlabUrl: string | null
  token: string | null
  mcp: McpConfig | null
  restoreOnStartup: boolean
}

const trimSlash = (s: string) => s.replace(/\/+$/, '')

/** Cross-platform per-user app data dir. Overridable via LUMEN_CONFIG_DIR (tests). */
export function configDir(): string {
  if (process.env.LUMEN_CONFIG_DIR) return process.env.LUMEN_CONFIG_DIR
  const home = homedir()
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Lumen')
    case 'win32':
      return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Lumen')
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'Lumen')
  }
}

const configPath = () => join(configDir(), 'config.json')

export function loadConfig(): AppConfig {
  const path = configPath()
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppConfig>
    return {
      gitlabUrl: raw.gitlabUrl ? trimSlash(raw.gitlabUrl) : null,
      token: raw.token ?? null,
      mcp: raw.mcp ?? null,
      restoreOnStartup: raw.restoreOnStartup ?? true,
    }
  }
  // First-run convenience: import from environment (.env in dev) if present.
  const envUrl = process.env.GITLAB_URL
  const envToken = process.env.GITLAB_TOKEN
  if (envUrl && envToken)
    return { gitlabUrl: trimSlash(envUrl), token: envToken, mcp: null, restoreOnStartup: true }
  return { gitlabUrl: null, token: null, mcp: null, restoreOnStartup: true }
}

function persist(data: AppConfig): void {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(data, null, 2), { mode: 0o600 })
}

export function saveConfig(input: { url: string; token?: string }): void {
  const current = loadConfig()
  const token = input.token ?? current.token
  if (!token) throw new Error('GitLab token is required')
  persist({
    gitlabUrl: trimSlash(input.url),
    token,
    mcp: current.mcp,
    restoreOnStartup: current.restoreOnStartup,
  })
}

export function saveMcpConfig(mcp: McpConfig): void {
  const current = loadConfig()
  persist({
    gitlabUrl: current.gitlabUrl,
    token: current.token,
    mcp,
    restoreOnStartup: current.restoreOnStartup,
  })
}

export function saveRestoreOnStartup(enabled: boolean): void {
  const current = loadConfig()
  persist({
    gitlabUrl: current.gitlabUrl,
    token: current.token,
    mcp: current.mcp,
    restoreOnStartup: enabled,
  })
}

export function clearConfig(): void {
  const path = configPath()
  if (existsSync(path)) rmSync(path)
}
