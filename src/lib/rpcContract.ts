export interface ConfigStatus {
  url: string | null
  configured: boolean
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
  token: string
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
}

export type LumenRPC = {
  maxRequestTime: number
  handlers: { requests: LumenRequests; messages: Record<string, never> }
}
