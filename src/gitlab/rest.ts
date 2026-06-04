import { normalizeError, type GitLabError } from './errors'

// The dev server proxies /gitlab/* -> GITLAB_URL/api/* and attaches the token
// server-side (see vite.config.ts), so REST calls just target /gitlab/v4 with no
// auth header in the browser — the same trust path the GraphQL client relies on.
const REST_BASE = '/gitlab/v4'

function httpError(status: number, statusText: string): GitLabError {
  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      message:
        'Authentication failed — check GITLAB_URL and GITLAB_TOKEN in .env (token scope: api).',
    }
  }
  return { kind: 'network', message: `GitLab request failed (${status} ${statusText || 'error'}).` }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${REST_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    })
  } catch (e) {
    // Connection-level failure (proxy down, offline) — reuse the GraphQL mapping.
    throw normalizeError(e)
  }
  if (!res.ok) throw httpError(res.status, res.statusText)
  // star/unstar echo the project; some endpoints may return an empty body.
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export const restGet = <T>(path: string): Promise<T> => request<T>(path)
export const restPost = <T>(path: string): Promise<T> => request<T>(path, { method: 'POST' })
