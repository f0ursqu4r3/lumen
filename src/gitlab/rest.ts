import { rpc } from '@/shared/lib/rpc'
import type { GitLabError } from './errors'

// Callers pass a `/v4`-relative path (e.g. `/projects/7/star`); this helper
// prepends `/v4` before handing it to the Bun RPC, which builds the final
// `${gitlabUrl}/api/v4/...` URL and attaches the token (see src/bun/gitlab.ts).
// Call sites stay token-free. We keep the same restGet/restPost surface and
// error mapping the previous version had.
function isJsonBody(body: string): boolean {
  if (!body) return false
  try {
    JSON.parse(body)
    return true
  } catch {
    return false
  }
}

function httpError(status: number, statusText: string, body: string): GitLabError {
  // 401 is always the token. A 403 is ambiguous: GitLab answers with a JSON
  // body, but an edge/LB block (off-VPN, WAF) is an HTML 403 — the server is
  // unreachable, not the token. Only treat a 403 as auth when its body is JSON.
  if (status === 401 || (status === 403 && isJsonBody(body))) {
    return {
      kind: 'auth',
      message:
        'Authentication failed — open Settings and check the GitLab URL and token (scope: api).',
    }
  }
  if (status === 403) return { kind: 'unavailable', message: 'GitLab is unavailable.' }
  // A 5xx means the server is unreachable or erroring, not the token. Mirrors
  // normalizeError in src/gitlab/errors.ts.
  if (status >= 500) {
    return { kind: 'unavailable', message: `GitLab is unavailable (${status}).` }
  }
  return { kind: 'network', message: `GitLab request failed (${status} ${statusText || 'error'}).` }
}

async function request<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  const res = await rpc.gitlabRest({ method, path: `/v4${path}` })
  if (!res.ok) throw httpError(res.status, res.statusText, res.body)
  return (res.body ? JSON.parse(res.body) : null) as T
}

export const restGet = <T>(path: string): Promise<T> => request<T>('GET', path)
export const restPost = <T>(path: string): Promise<T> => request<T>('POST', path)
