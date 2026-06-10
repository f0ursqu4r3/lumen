import { z } from 'zod'
import type { McpTool } from '../types'
import { text } from '../types'
import { gql } from './client'

const LABELS_Q = `query($p:ID!,$search:String){project(fullPath:$p){labels(searchTerm:$search,includeAncestorGroups:true,first:100){nodes{title color description}}}}`
const MILESTONES_Q = `query($p:ID!,$state:MilestoneStateEnum){project(fullPath:$p){milestones(state:$state,first:100,sort:DUE_DATE_ASC){nodes{title state dueDate startDate webPath}}}}`

export const labelTools: McpTool[] = [
  {
    name: 'lumen_labels_list',
    description: 'List labels available in a project (including ancestor-group labels).',
    inputSchema: { project: z.string(), search: z.string().optional() },
    handler: async (a) => {
      const data = await gql<{ project: { labels: { nodes: unknown[] } } | null }>(LABELS_Q, {
        p: a.project,
        search: a.search ?? null,
      })
      return text({ labels: data.project?.labels.nodes ?? [] })
    },
  },
  {
    name: 'lumen_milestones_list',
    description: 'List milestones in a project, optionally filtered by state.',
    inputSchema: { project: z.string(), state: z.enum(['active', 'closed']).optional() },
    handler: async (a) => {
      const data = await gql<{ project: { milestones: { nodes: unknown[] } } | null }>(
        MILESTONES_Q,
        {
          p: a.project,
          state: a.state ?? null,
        },
      )
      return text({ milestones: data.project?.milestones.nodes ?? [] })
    },
  },
]
