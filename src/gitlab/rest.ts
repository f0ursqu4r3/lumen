import { rpc } from '@/lib/rpc'
import type { GitLabError } from './errors'

// Callers pass a `/v4`-relative path (e.g. `/projects/7/star`); this helper
// prepends `/v4` before handing it to the Bun RPC, which builds the final
// `${gitlabUrl}/api/v4/...` URL and attaches the token (see src/bun/gitlab.ts).
// Call sites stay token-free. We keep the same restGet/restPost surface and
// error mapping the previous version had.
function httpError(status: number, statusText: string): GitLabError {
  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      message:
        'Authentication failed — open Settings and check the GitLab URL and token (scope: api).',
    }
  }
  return { kind: 'network', message: `GitLab request failed (${status} ${statusText || 'error'}).` }
}

async function request<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  const res = await rpc.gitlabRest({ method, path: `/v4${path}` })
  if (!res.ok) throw httpError(res.status, res.statusText)
  return (res.body ? JSON.parse(res.body) : null) as T
}

export const restGet = <T>(path: string): Promise<T> => request<T>('GET', path)
export const restPost = <T>(path: string): Promise<T> => request<T>('POST', path)
