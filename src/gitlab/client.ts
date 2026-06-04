import { GraphQLClient } from 'graphql-request'
import { rpc } from '@/lib/rpc'

// The Bun main process is the runtime now: it holds the token and performs the
// upstream GraphQL fetch. graphql-request still drives query construction and
// ClientError semantics; we just swap its transport for an RPC round-trip and
// rebuild a Response (preserving the upstream status so errors.ts maps 401/403).
export async function rpcGraphqlFetch(_url: string, init?: RequestInit): Promise<Response> {
  const body = typeof init?.body === 'string' ? init.body : '{}'
  const { query, variables } = JSON.parse(body) as { query: string; variables?: Record<string, unknown> }
  const { status, data, errors } = await rpc.gitlabGraphql({ query, variables })
  return new Response(JSON.stringify({ data, errors }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// graphql-request requires an absolute endpoint; the value is unused (the shim
// ignores the URL), so any absolute placeholder works.
export const gqlClient = new GraphQLClient('https://gitlab.local/graphql', {
  fetch: rpcGraphqlFetch as unknown as typeof fetch,
})
