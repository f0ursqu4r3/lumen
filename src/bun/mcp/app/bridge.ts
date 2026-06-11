import type { AppStateSnapshot, McpAppCommand } from '@/shared/lib/rpcContract'

export interface WindowInfo {
  kind: 'main' | 'issue' | 'issues-window' | 'settings'
  key?: string // `${fullPath}#${iid}` for issue windows
}

/**
 * Host capabilities injected by src/bun/index.ts at boot. Dependency-injected
 * (not imported) so mcp/app never imports the entrypoint — no import cycle,
 * and tools are testable with a stub host.
 */
export interface HostActions {
  openIssueWindow: (a: { fullPath: string; iid: string }) => { ok: boolean }
  openIssuesWindow: (a: { fullPath: string; iids: string[] }) => { ok: boolean }
  openSettingsWindow: () => { ok: boolean }
  notify: (a: { title: string; body?: string; subtitle?: string; silent?: boolean }) => void
  /** Run JS in the main window's webview; { ok: false } if it's gone. */
  driveMain: (js: string) => { ok: boolean }
  listWindows: () => WindowInfo[]
}

let snapshot: AppStateSnapshot | null = null
let host: HostActions | null = null

/** Called by the reportAppState RPC handler (main window pushes on change). */
export function cacheSnapshot(s: AppStateSnapshot): void {
  snapshot = s
}

/** Latest main-window snapshot, or null before the first report. */
export function getSnapshot(): AppStateSnapshot | null {
  return snapshot
}

export function setHostActions(h: HostActions): void {
  host = h
}

export function getHostActions(): HostActions | null {
  return host
}

/** The executeJavascript payload for a drive command. JSON.stringify owns escaping. */
export function buildCommandJs(command: McpAppCommand): string {
  return `window.dispatchEvent(new CustomEvent('lumen:mcp-command',{detail:${JSON.stringify(command)}}))`
}

/** Test-only: reset module state between cases. */
export function __resetBridge(): void {
  snapshot = null
  host = null
}
