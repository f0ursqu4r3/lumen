import { ClientError } from 'graphql-request'

export type GitLabErrorKind = 'auth' | 'graphql' | 'network' | 'unknown'

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
    const gql = err.response?.errors?.[0]?.message
    if (gql) return { kind: 'graphql', message: gql }
    // Fires for a ClientError response carrying no GraphQL errors (e.g. a 5xx).
    return { kind: 'network', message: err.message }
  }
  if (err instanceof Error) return { kind: 'unknown', message: err.message }
  return { kind: 'unknown', message: 'Unknown error' }
}
