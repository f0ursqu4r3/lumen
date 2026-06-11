export interface ConfigStatus {
  url: string | null
  configured: boolean
  tokenSuffix: string | null
}
export interface McpStatus {
  enabled: boolean
  port: number
  running: boolean
  hasToken: boolean
}
export interface GraphqlArgs {
  query: string
  variables?: Record<string, unknown>
  silent?: boolean // when true, the host does NOT feed this request's outcome into server-health (connect/reconnect/settings probes)
}
export interface GraphqlResult {
  status: number
  data?: unknown
  errors?: { message: string }[]
}
export interface RestArgs {
  method: 'GET' | 'POST'
  path: string
}
export interface RestResult {
  ok: boolean
  status: number
  statusText: string
  body: string
}
export interface AssetArgs {
  path: string
}
export interface AssetResult {
  base64: string
  contentType: string
}
export interface UploadArgs {
  fullPath: string
  filename: string
  contentType: string
  dataBase64: string
}
export interface UploadResult {
  ok: boolean
  status: number
  markdown?: string
  url?: string
  alt?: string
}
export interface SaveConfigArgs {
  url: string
  token?: string
}
export interface NotifyArgs {
  title: string
  body?: string
  subtitle?: string
  silent?: boolean
}
export interface ServerHealth {
  state: 'ok' | 'down' | 'expired'
  secondsLeft: number
  probing: boolean
}

// What the main window's webview reports about itself (cached host-side for
// the MCP lumen_app_state tool). Popout windows never report.
export interface AppStateSnapshot {
  route: string // current route path, e.g. /projects/a/b/issues
  view: string // route name, e.g. 'issues'
  projectPath: string | null
  selectedIssueIids: string[] // multi-select state; [] when none
  visibleIssueIids: string[] // iids loaded in the current list/board
}

// Commands the host pushes into the main webview via the lumen:mcp-command
// CustomEvent (MCP lumen_app_navigate). Unknown cmds are ignored by the webview.
export interface McpAppCommand {
  cmd: 'navigate'
  view: string
  project?: string
  iid?: string
}

export interface LumenRequests {
  gitlabGraphql: (a: GraphqlArgs) => Promise<GraphqlResult>
  gitlabRest: (a: RestArgs) => Promise<RestResult>
  gitlabAsset: (a: AssetArgs) => Promise<AssetResult>
  gitlabUpload: (a: UploadArgs) => Promise<UploadResult>
  getConfig: () => Promise<ConfigStatus>
  // The hash route this window should open at, applied client-side before mount.
  // The bundled views:// scheme can't load an initial URL with the route in its
  // fragment, so popouts load the bare app and ask the host where to go. The main
  // window gets `{ route: null }` and stays on the default route.
  getInitialRoute: () => Promise<{ route: string | null }>
  saveConfig: (a: SaveConfigArgs) => Promise<{ ok: true }>
  clearConfig: () => Promise<{ ok: true }>
  // Open a URL in the OS default browser. The native webview ignores
  // <a target="_blank">, so external links must round-trip through the host.
  openExternal: (a: { url: string }) => Promise<{ ok: boolean }>
  // Write text to the system clipboard via the host. navigator.clipboard is
  // unavailable under the views:// origin (not a secure context).
  clipboardWriteText: (a: { text: string }) => Promise<{ ok: true }>
  // Show a native desktop notification (e.g. when a watched pipeline finishes).
  // The Notification web API isn't available under the views:// origin, so this
  // round-trips to the host's Utils.showNotification.
  showNotification: (a: NotifyArgs) => Promise<{ ok: true }>
  // Open a focused, single-issue native window (or focus the existing one for
  // this issue). The window loads the SPA at the issue route with ?window=1.
  openIssueWindow: (a: { fullPath: string; iid: string }) => Promise<{ ok: boolean }>
  // Open a combined native window paging through several issues (one window per
  // call, no dedupe). The window loads the issues-window route with ?window=1.
  openIssuesWindow: (a: { fullPath: string; iids: string[] }) => Promise<{ ok: boolean }>
  openSettingsWindow: () => Promise<{ ok: boolean }>
  getMcpStatus: () => Promise<McpStatus>
  setMcpEnabled: (a: {
    enabled: boolean
    port: number
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  regenerateMcpToken: () => Promise<{ token: string }>
  revealMcpToken: () => Promise<{ token: string | null }>
  notifyCacheCleared: () => Promise<{ ok: true }>
  getServerHealth: () => Promise<ServerHealth>
  retryServerNow: () => Promise<{ ok: true }>
  resetServerHealth: () => Promise<{ ok: true }>
  // Main window pushes its state snapshot on change (debounced webview-side);
  // the host caches it for the MCP app-control read tool.
  reportAppState: (a: AppStateSnapshot) => Promise<{ ok: true }>
}

export type LumenRPC = {
  maxRequestTime: number
  handlers: { requests: LumenRequests; messages: Record<string, never> }
}
