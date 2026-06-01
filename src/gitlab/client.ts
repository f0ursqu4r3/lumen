import { GraphQLClient } from 'graphql-request'

// graphql-request parses its endpoint with `new URL()`, which rejects a bare
// path. Resolve against the current origin so it's absolute; the Vite dev-server
// proxy still forwards /gitlab -> GITLAB_URL/api and attaches the token, so no
// auth header is set here on purpose.
export const gqlEndpoint = () => new URL('/gitlab/graphql', window.location.origin).toString()

export const gqlClient = new GraphQLClient(gqlEndpoint())
