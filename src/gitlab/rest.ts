import { rpc } from '@/lib/rpc'
import type { GitLabError } from './errors'

// The Bun main process proxies REST to GITLAB_URL/api/* and attaches the token
// (see src/bun/gitlab.ts), so call sites stay token-free. We keep the same
// restGet/restPost surface and error mapping the proxy version had.
function httpError(status: number, statusText: string): GitLabError {
  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      message: 'Authentication failed — open Settings and check the GitLab URL and token (scope: api).',
    }
  }
  return { kind: 'network', message: `GitLab request failed (${status} ${statusText || 'error'}).` }
}

async function request<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  const res = await rpc.gitlabRest({ method, path })
  if (!res.ok) throw httpError(res.status, res.statusText)
  return (res.body ? JSON.parse(res.body) : null) as T
}

export const restGet = <T>(path: string): Promise<T> => request<T>('GET', path)
export const restPost = <T>(path: string): Promise<T> => request<T>('POST', path)
