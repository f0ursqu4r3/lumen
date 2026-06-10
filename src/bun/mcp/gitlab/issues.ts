import { z } from 'zod'
import type { McpTool } from '../types'
import { text, errorResult } from '../types'
import { gql, resolveLabelIds, resolveUserIds, resolveMilestoneId } from './client'

const LIST_Q = `query($p:ID!,$state:IssuableState,$labelName:[String],$assigneeUsernames:[String!],$milestoneTitle:[String],$search:String,$first:Int,$after:String){
  project(fullPath:$p){ issues(state:$state,labelName:$labelName,assigneeUsernames:$assigneeUsernames,milestoneTitle:$milestoneTitle,search:$search,first:$first,after:$after,sort:UPDATED_DESC){
    nodes{ iid title state webUrl updatedAt labels{nodes{title}} assignees{nodes{username}} milestone{title} }
    pageInfo{ endCursor hasNextPage } } } }`

const GET_Q = `query($p:ID!,$iid:String!){
  project(fullPath:$p){ issue(iid:$iid){
    iid title state description webUrl createdAt updatedAt
    author{username} milestone{title}
    labels{nodes{title}} assignees{nodes{username}}
    discussions{nodes{notes{nodes{body author{username} createdAt}}}} } } }`

const ID_Q = `query($p:ID!,$iid:String!){project(fullPath:$p){issue(iid:$iid){id}}}`

const CREATE_M = `mutation($input:CreateIssueInput!){createIssue(input:$input){issue{iid webUrl} errors}}`
const UPDATE_M = `mutation($input:UpdateIssueInput!){updateIssue(input:$input){issue{iid webUrl} errors}}`
const NOTE_M = `mutation($input:CreateNoteInput!){createNote(input:$input){note{id} errors}}`

export const issueTools: McpTool[] = [
  {
    name: 'lumen_issues_list',
    description:
      'List issues in a project, filtered by state, labels, assignee, milestone, or search text. Returns slim rows.',
    inputSchema: {
      project: z.string().describe('Project full path, e.g. "group/project".'),
      state: z.enum(['opened', 'closed', 'all']).optional(),
      labels: z.array(z.string()).optional().describe('Label titles (AND).'),
      assigneeUsername: z.string().optional(),
      milestoneTitle: z.string().optional(),
      search: z.string().optional(),
      first: z.number().int().min(1).max(100).optional().default(20),
      after: z.string().optional().describe('pageInfo.endCursor from a previous page.'),
    },
    handler: async (a) => {
      const data = await gql<{
        project: { issues: { nodes: unknown[]; pageInfo: unknown } } | null
      }>(LIST_Q, {
        p: a.project,
        state: a.state === 'all' ? null : (a.state ?? null),
        labelName: (a.labels as string[] | undefined) ?? null,
        assigneeUsernames: a.assigneeUsername ? [a.assigneeUsername] : null,
        milestoneTitle: a.milestoneTitle ? [a.milestoneTitle] : null,
        search: a.search ?? null,
        first: a.first ?? 20,
        after: a.after ?? null,
      })
      const conn = data.project?.issues ?? { nodes: [], pageInfo: {} }
      return text({ issues: conn.nodes, pageInfo: conn.pageInfo })
    },
  },
  {
    name: 'lumen_issue_get',
    description:
      'Get full detail for one issue (description, labels, assignees, milestone, comments).',
    inputSchema: { project: z.string(), iid: z.string() },
    handler: async (a) => {
      const data = await gql<{ project: { issue: unknown } | null }>(GET_Q, {
        p: a.project,
        iid: a.iid,
      })
      if (!data.project?.issue) return errorResult(`Issue ${a.iid} not found in ${a.project}.`)
      return text(data.project.issue)
    },
  },
  {
    name: 'lumen_issue_create',
    description:
      'Create an issue. Labels are titles; assignees are usernames; milestone is a title.',
    inputSchema: {
      project: z.string(),
      title: z.string(),
      description: z.string().optional(),
      labels: z.array(z.string()).optional(),
      assigneeUsernames: z.array(z.string()).optional(),
      milestoneTitle: z.string().optional(),
    },
    handler: async (a) => {
      const input: Record<string, unknown> = { projectPath: a.project, title: a.title }
      if (a.description) input.description = a.description
      if (a.labels) input.labels = a.labels
      if (a.assigneeUsernames)
        input.assigneeIds = await resolveUserIds(
          a.project as string,
          a.assigneeUsernames as string[],
        )
      if (a.milestoneTitle)
        input.milestoneId = await resolveMilestoneId(
          a.project as string,
          a.milestoneTitle as string,
        )
      const data = await gql<{
        createIssue: { issue: { iid: string; webUrl: string } | null; errors: string[] }
      }>(CREATE_M, { input })
      if (data.createIssue.errors.length) return errorResult(data.createIssue.errors.join('; '))
      return text({ created: data.createIssue.issue })
    },
  },
  {
    name: 'lumen_issue_update',
    description:
      'Update an issue: title, description, state (close/reopen), labels (replace), assignees, milestone.',
    inputSchema: {
      project: z.string(),
      iid: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      state: z.enum(['close', 'reopen']).optional(),
      labels: z.array(z.string()).optional().describe('Replaces all labels.'),
      assigneeUsernames: z.array(z.string()).optional(),
      milestoneTitle: z.string().optional(),
    },
    handler: async (a) => {
      const input: Record<string, unknown> = { projectPath: a.project, iid: a.iid }
      if (a.title !== undefined) input.title = a.title
      if (a.description !== undefined) input.description = a.description
      if (a.state) input.stateEvent = a.state === 'close' ? 'CLOSE' : 'REOPEN'
      if (a.labels)
        input.labelIds = await resolveLabelIds(a.project as string, a.labels as string[])
      if (a.assigneeUsernames)
        input.assigneeIds = await resolveUserIds(
          a.project as string,
          a.assigneeUsernames as string[],
        )
      if (a.milestoneTitle)
        input.milestoneId = await resolveMilestoneId(
          a.project as string,
          a.milestoneTitle as string,
        )
      const data = await gql<{
        updateIssue: { issue: { iid: string; webUrl: string } | null; errors: string[] }
      }>(UPDATE_M, { input })
      if (data.updateIssue.errors.length) return errorResult(data.updateIssue.errors.join('; '))
      return text({ updated: data.updateIssue.issue })
    },
  },
  {
    name: 'lumen_issue_comment',
    description: 'Add a comment to an issue.',
    inputSchema: { project: z.string(), iid: z.string(), body: z.string() },
    handler: async (a) => {
      const idData = await gql<{ project: { issue: { id: string } | null } | null }>(ID_Q, {
        p: a.project,
        iid: a.iid,
      })
      const noteableId = idData.project?.issue?.id
      if (!noteableId) return errorResult(`Issue ${a.iid} not found in ${a.project}.`)
      const data = await gql<{ createNote: { note: { id: string } | null; errors: string[] } }>(
        NOTE_M,
        {
          input: { noteableId, body: a.body },
        },
      )
      if (data.createNote.errors.length) return errorResult(data.createNote.errors.join('; '))
      return text(`Comment added to ${a.project}#${a.iid}.`)
    },
  },
]
