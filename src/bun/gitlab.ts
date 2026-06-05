import { loadConfig } from './config'
import type {
  GraphqlArgs,
  GraphqlResult,
  RestArgs,
  RestResult,
  AssetArgs,
  AssetResult,
} from '@/lib/rpcContract'

interface Cfg {
  gitlabUrl: string
  token: string
}

// Bun's fetch accepts a `tls` option; type it locally so builders stay testable.
type FetchInit = RequestInit & { tls?: { rejectUnauthorized?: boolean } }

const authHeaders = (token: string): Record<string, string> => ({ 'PRIVATE-TOKEN': token })
const tlsOff = { rejectUnauthorized: false } as const

export function buildGraphql(cfg: Cfg, a: GraphqlArgs): { url: string; init: FetchInit } {
  return {
    url: `${cfg.gitlabUrl}/api/graphql`,
    init: {
      method: 'POST',
      headers: { ...authHeaders(cfg.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: a.query, variables: a.variables }),
      tls: tlsOff,
    },
  }
}

export function buildRest(cfg: Cfg, a: RestArgs): { url: string; init: FetchInit } {
  return {
    url: `${cfg.gitlabUrl}/api${a.path}`,
    init: {
      method: a.method,
      headers: { ...authHeaders(cfg.token), Accept: 'application/json' },
      tls: tlsOff,
    },
  }
}

export function buildAsset(cfg: Cfg, a: AssetArgs): { url: string; init: FetchInit } {
  return {
    url: `${cfg.gitlabUrl}/api${a.path}`,
    init: { headers: authHeaders(cfg.token), tls: tlsOff },
  }
}

function requireCfg(): Cfg {
  const { gitlabUrl, token } = loadConfig()
  if (!gitlabUrl || !token) throw new Error('GitLab is not configured')
  return { gitlabUrl, token }
}

export async function gitlabGraphql(a: GraphqlArgs): Promise<GraphqlResult> {
  const { url, init } = buildGraphql(requireCfg(), a)
  const res = await fetch(url, init as RequestInit)
  if (!res.ok && res.status === 401) return { status: 401, errors: [{ message: 'Unauthorized' }] }
  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown
    errors?: { message: string }[]
  }
  return { status: res.status, data: json.data, errors: json.errors }
}

export async function gitlabRest(a: RestArgs): Promise<RestResult> {
  const { url, init } = buildRest(requireCfg(), a)
  const res = await fetch(url, init as RequestInit)
  const body = await res.text()
  return { ok: res.ok, status: res.status, statusText: res.statusText, body }
}

export async function gitlabAsset(a: AssetArgs): Promise<AssetResult> {
  const { url, init } = buildAsset(requireCfg(), a)
  const res = await fetch(url, init as RequestInit)
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    base64: buf.toString('base64'),
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
  }
}
