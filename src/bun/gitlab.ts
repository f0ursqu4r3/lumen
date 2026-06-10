import { loadConfig } from './config'
import { observe, isProbing, classifyStatus } from './serverHealth'
import type {
  GraphqlArgs,
  GraphqlResult,
  RestArgs,
  RestResult,
  AssetArgs,
  AssetResult,
} from '@/shared/lib/rpcContract'

function looksJson(body: string): boolean {
  if (!body) return false
  try {
    JSON.parse(body)
    return true
  } catch {
    return false
  }
}

/** Feed a request's outcome into the health monitor, unless we ARE the probe. */
function report(status: number, hasErrorBody: boolean): void {
  if (!isProbing()) observe(classifyStatus(status, hasErrorBody))
}

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
  let res: Response
  try {
    res = await fetch(url, init as RequestInit)
  } catch {
    // Transport failure (DNS, connection refused, timeout): the server is
    // unreachable, not the token. Surface a 503 so the client maps it to
    // `unavailable` (see src/gitlab/errors.ts) rather than a re-auth prompt.
    report(503, false)
    return { status: 503, errors: [{ message: 'GitLab is unreachable' }] }
  }
  // Only 401 needs a synthesized errors array (the body may be empty/non-JSON).
  // Every other status — 403 and real 5xx included — passes through below with
  // its status preserved, so errors.ts can classify it (auth / unavailable).
  if (!res.ok && res.status === 401) {
    report(401, false)
    return { status: 401, errors: [{ message: 'Unauthorized' }] }
  }
  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown
    errors?: { message: string }[]
  }
  report(res.status, Boolean(json.errors?.length))
  return { status: res.status, data: json.data, errors: json.errors }
}

export async function gitlabRest(a: RestArgs): Promise<RestResult> {
  const { url, init } = buildRest(requireCfg(), a)
  let res: Response
  try {
    res = await fetch(url, init as RequestInit)
  } catch {
    // See gitlabGraphql: transport failure → 503 so rest.ts maps to `unavailable`.
    report(503, false)
    return { ok: false, status: 503, statusText: 'Service Unavailable', body: '' }
  }
  const body = await res.text()
  report(res.status, res.status === 403 ? looksJson(body) : false)
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
