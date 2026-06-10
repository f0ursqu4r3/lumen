import { z } from 'zod'
import type { McpTool } from '../types'
import { text } from '../types'
import { gql } from './client'

const ME_Q = `query{currentUser{username name publicEmail id}}`
const MEMBERS_Q = `query($p:ID!,$search:String){project(fullPath:$p){projectMembers(search:$search,first:100){nodes{user{username name}}}}}`
const SEARCH_Q = `query($p:ID!,$q:String!){project(fullPath:$p){
  issues(search:$q,first:20,sort:UPDATED_DESC){nodes{iid title state webUrl updatedAt}}
  mergeRequests(search:$q,first:20,sort:UPDATED_DESC){nodes{iid title state webUrl updatedAt}} } }`

export const userTools: McpTool[] = [
  {
    name: 'lumen_me',
    description: 'The current user — the identity behind the configured token.',
    inputSchema: {},
    handler: async () => {
      const data = await gql<{ currentUser: unknown }>(ME_Q)
      return text(data.currentUser)
    },
  },
  {
    name: 'lumen_members_list',
    description: 'List project members (for assignee/reviewer lookup).',
    inputSchema: { project: z.string(), search: z.string().optional() },
    handler: async (a) => {
      const data = await gql<{
        project: { projectMembers: { nodes: { user: unknown }[] } } | null
      }>(MEMBERS_Q, {
        p: a.project,
        search: a.search ?? null,
      })
      const members = (data.project?.projectMembers.nodes ?? []).map((n) => n.user).filter(Boolean)
      return text({ members })
    },
  },
  {
    name: 'lumen_search',
    description:
      'Search issues and merge requests within a single project by text. (GitLab has no cross-project search; a project is required.)',
    inputSchema: { project: z.string(), query: z.string() },
    handler: async (a) => {
      const data = await gql<{
        project: { issues: { nodes: unknown[] }; mergeRequests: { nodes: unknown[] } } | null
      }>(SEARCH_Q, { p: a.project, q: a.query })
      return text({
        issues: data.project?.issues.nodes ?? [],
        mergeRequests: data.project?.mergeRequests.nodes ?? [],
      })
    },
  },
]
