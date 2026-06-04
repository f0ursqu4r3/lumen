export interface ConfigStatus { url: string | null; configured: boolean }
export interface GraphqlArgs { query: string; variables?: Record<string, unknown> }
export interface GraphqlResult { status: number; data?: unknown; errors?: { message: string }[] }
export interface RestArgs { method: 'GET' | 'POST'; path: string }
export interface RestResult { ok: boolean; status: number; statusText: string; body: string }
export interface AssetArgs { path: string }
export interface AssetResult { base64: string; contentType: string }
export interface SaveConfigArgs { url: string; token: string }

export interface LumenRequests {
  gitlabGraphql: (a: GraphqlArgs) => Promise<GraphqlResult>
  gitlabRest: (a: RestArgs) => Promise<RestResult>
  gitlabAsset: (a: AssetArgs) => Promise<AssetResult>
  getConfig: () => Promise<ConfigStatus>
  saveConfig: (a: SaveConfigArgs) => Promise<{ ok: true }>
  clearConfig: () => Promise<{ ok: true }>
}

export type LumenRPC = {
  maxRequestTime: number
  handlers: { requests: LumenRequests; messages: Record<string, never> }
}
