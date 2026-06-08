export interface ConfigStatus {
  url: string | null
  configured: boolean
  tokenSuffix: string | null
}
export interface GraphqlArgs {
  query: string
  variables?: Record<string, unknown>
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

export interface LumenRequests {
  gitlabGraphql: (a: GraphqlArgs) => Promise<GraphqlResult>
  gitlabRest: (a: RestArgs) => Promise<RestResult>
  gitlabAsset: (a: AssetArgs) => Promise<AssetResult>
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
}

export type LumenRPC = {
  maxRequestTime: number
  handlers: { requests: LumenRequests; messages: Record<string, never> }
}
