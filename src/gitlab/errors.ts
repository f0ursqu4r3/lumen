import { ClientError } from 'graphql-request'

export type GitLabErrorKind = 'auth' | 'unavailable' | 'graphql' | 'network' | 'unknown'

export interface GitLabError {
  kind: GitLabErrorKind
  message: string
}

export function normalizeError(err: unknown): GitLabError {
  if (err instanceof ClientError) {
    const status = err.response?.status
    if (status === 401 || status === 403) {
      return {
        kind: 'auth',
        message:
          'Authentication failed — check GITLAB_URL and GITLAB_TOKEN in .env (token scope: api).',
      }
    }
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
