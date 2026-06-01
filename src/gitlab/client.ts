import { GraphQLClient } from 'graphql-request'

// Hits the Vite dev-server proxy, which forwards to GITLAB_URL/api/graphql
// and attaches the token. No auth header is set here on purpose.
export const gqlClient = new GraphQLClient('/gitlab/graphql')
