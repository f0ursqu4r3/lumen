import { ClientError } from 'graphql-request'

export type GitLabErrorKind = 'auth' | 'unavailable' | 'graphql' | 'network' | 'unknown'

export interface GitLabError {
  kind: GitLabErrorKind
  message: string
}

export function normalizeError(err: unknown): GitLabError {
  if (err instanceof ClientError) {
    const status = err.response?.status
    const gqlErr = err.response?.errors?.[0]?.message
    // 401 is always the token. A 403, though, is ambiguous: GitLab's own
    // rejection carries a GraphQL error body, but an edge/LB block (off-VPN,
    // WAF) is a bodyless HTML 403 — the server is unreachable, not the token.
    // Only treat a 403 as auth when it actually carries a GraphQL error.
    if (status === 401 || (status === 403 && gqlErr)) {
      return {
        kind: 'auth',
        message:
          'Authentication failed — check GITLAB_URL and GITLAB_TOKEN in .env (token scope: api).',
      }
    }
    if (status === 403) return { kind: 'unavailable', message: 'GitLab is unavailable.' }
    // A 5xx means the server is unreachable or erroring — the token is fine.
    // Checked before the GraphQL-message branch so a 5xx is never mislabeled
    // `graphql`.
    if (typeof status === 'number' && status >= 500) {
      return { kind: 'unavailable', message: 'GitLab is unavailable.' }
    }
    const gql = err.response?.errors?.[0]?.message
    if (gql) return { kind: 'graphql', message: gql }
    return { kind: 'network', message: err.message }
  }
  if (err instanceof Error) return { kind: 'unknown', message: err.message }
  return { kind: 'unknown', message: 'Unknown error' }
}
