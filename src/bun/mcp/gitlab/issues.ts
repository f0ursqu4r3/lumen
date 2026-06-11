import { z } from 'zod'
import type { McpTool } from '../types'
import { text, errorResult } from '../types'
import { gql, resolveLabelIds, resolveUserIds, resolveMilestoneId } from './client'
import { emitInvalidate } from '../app/bridge'

const LIST_Q = `query($p:ID!,$state:IssuableState,$labelName:[String],$assigneeUsernames:[String!],$milestoneTitle:[String],$search:String,$first:Int,$after:String){
  project(fullPath:$p){ issues(state:$state,labelName:$labelName,assigneeUsernames:$assigneeUsernames,milestoneTitle:$milestoneTitle,search:$search,first:$first,after:$after,sort:UPDATED_DESC){
    nodes{ iid title state webUrl updatedAt labels{nodes{title}} assignees{nodes{username}} milestone{title} }
    pageInfo{ endCursor hasNextPage } } } }`

const GET_Q = `query($p:ID!,$iid:String!){
  project(fullPath:$p){ issue(iid:$iid){
    iid title state description webUrl createdAt updatedAt
    author{username} milestone{title}
    status {id name category}
    labels{nodes{title}} assignees{nodes{username}}
    discussions{nodes{notes{nodes{id body author{username} createdAt}}}} } } }`

const ID_Q = `query($p:ID!,$iid:String!){project(fullPath:$p){issue(iid:$iid){id}}}`

// Work-item "Status" (To do / In progress / Done / …) is a WorkItem widget,
// not part of UpdateIssue. Setting it takes three hops: resolve the issue's
// WorkItem id, resolve the status name to its id on the project's namespace,
// then fire workItemUpdate. Mirrors src/features/issues/composables/useWorkItemStatus.ts.
const WORK_ITEM_ID_Q = `query($p:ID!,$iid:String!){project(fullPath:$p){workItems(iid:$iid){nodes{id}}}}`
const STATUSES_Q = `query($g:ID!){namespace(fullPath:$g){statuses{nodes{id name}}}}`
const SET_STATUS_M = `mutation($id:WorkItemID!,$status:WorkItemsStatusesStatusID!){
  workItemUpdate(input:{id:$id,statusWidget:{status:$status}}){
    errors
    workItem{ widgets{ ... on WorkItemWidgetStatus{ status{id name category} } } } } }`

// The status list lives on the project's parent namespace (its group).
const groupPath = (fullPath: string) => fullPath.split('/').slice(0, -1).join('/')

const CREATE_M = `mutation($input:CreateIssueInput!){createIssue(input:$input){issue{iid webUrl} errors}}`
const UPDATE_M = `mutation($input:UpdateIssueInput!){updateIssue(input:$input){issue{iid webUrl} errors}}`
const SET_ASSIGNEES_M = `mutation($input:IssueSetAssigneesInput!){issueSetAssignees(input:$input){issue{iid} errors}}`
const NOTE_M = `mutation($input:CreateNoteInput!){createNote(input:$input){note{id} errors}}`
const CURRENT_USER_Q = `{currentUser{username}}`
const UPDATE_NOTE_M = `mutation($input:UpdateNoteInput!){updateNote(input:$input){note{id} errors}}`

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
    inputSchema: { project: z.string(), iid: z.string().regex(/^\d+$/, 'iid must be numeric') },
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
      if (data.createIssue.errors.length || !data.createIssue.issue)
        return errorResult(data.createIssue.errors.join('; ') || 'Issue was not created.')
      emitInvalidate({ resource: 'issue', project: a.project as string })
      return text({ created: data.createIssue.issue })
    },
  },
  {
    name: 'lumen_issue_update',
    description:
      'Update an issue: title, description, state (close/reopen), labels (replace), assignees, milestone.',
    inputSchema: {
      project: z.string(),
      iid: z.string().regex(/^\d+$/, 'iid must be numeric'),
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
      if (a.milestoneTitle)
        input.milestoneId = await resolveMilestoneId(
          a.project as string,
          a.milestoneTitle as string,
        )
      const data = await gql<{
        updateIssue: { issue: { iid: string; webUrl: string } | null; errors: string[] }
      }>(UPDATE_M, { input })
      if (data.updateIssue.errors.length) return errorResult(data.updateIssue.errors.join('; '))
      // Assignees are not part of UpdateIssueInput — they go through the separate
      // issueSetAssignees mutation, which takes usernames directly (no id resolution).
      if (a.assigneeUsernames) {
        const asg = await gql<{ issueSetAssignees: { errors: string[] } }>(SET_ASSIGNEES_M, {
          input: { projectPath: a.project, iid: a.iid, assigneeUsernames: a.assigneeUsernames },
        })
        if (asg.issueSetAssignees.errors.length)
          return errorResult(asg.issueSetAssignees.errors.join('; '))
      }
      emitInvalidate({ resource: 'issue', project: a.project as string, iid: a.iid as string })
      return text({ updated: data.updateIssue.issue })
    },
  },
  {
    name: 'lumen_issue_set_status',
    description:
      'Set an issue\'s work-item Status (e.g. "To do", "In progress", "Done") — the native status widget, distinct from open/closed state and from labels. Status is matched by name, case-insensitively.',
    inputSchema: {
      project: z.string(),
      iid: z.string().regex(/^\d+$/, 'iid must be numeric'),
      status: z.string().describe('Status name, e.g. "In progress".'),
    },
    handler: async (a) => {
      const idData = await gql<{
        project: { workItems: { nodes: { id: string }[] } | null } | null
      }>(WORK_ITEM_ID_Q, { p: a.project, iid: a.iid })
      const workItemId = idData.project?.workItems?.nodes?.[0]?.id
      if (!workItemId) return errorResult(`Issue ${a.iid} not found in ${a.project}.`)

      const sData = await gql<{
        namespace: { statuses: { nodes: { id: string; name: string }[] } | null } | null
      }>(STATUSES_Q, { g: groupPath(a.project as string) })
      const statuses = sData.namespace?.statuses?.nodes ?? []
      const want = (a.status as string).toLowerCase()
      const match = statuses.find((s) => s.name.toLowerCase() === want)
      if (!match)
        return errorResult(
          `Unknown status "${a.status}". Available: ${statuses.map((s) => s.name).join(', ') || '(none)'}.`,
        )

      const data = await gql<{
        workItemUpdate: {
          errors: string[]
          workItem: { widgets: { status?: { name: string } | null }[] } | null
        } | null
      }>(SET_STATUS_M, { id: workItemId, status: match.id })
      const payload = data.workItemUpdate
      if (!payload || payload.errors.length)
        return errorResult(payload?.errors.join('; ') || 'Status update failed.')
      const status =
        payload?.workItem?.widgets.find((w) => w && 'status' in w && w.status)?.status ?? null
      emitInvalidate({ resource: 'issue', project: a.project as string, iid: a.iid as string })
      return text({ updated: { iid: a.iid, status } })
    },
  },
  {
    name: 'lumen_issue_comment',
    description: 'Add a comment to an issue.',
    inputSchema: {
      project: z.string(),
      iid: z.string().regex(/^\d+$/, 'iid must be numeric'),
      body: z.string(),
    },
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
      emitInvalidate({ resource: 'issue', project: a.project as string, iid: a.iid as string })
      return text(`Comment added to ${a.project}#${a.iid}.`)
    },
  },
  {
    name: 'lumen_issue_comment_edit',
    description:
      'Edit one of your own comments on an issue. Pass the note id from lumen_issue_get. Refuses to edit comments authored by anyone else.',
    inputSchema: {
      project: z.string(),
      iid: z.string().regex(/^\d+$/, 'iid must be numeric'),
      noteId: z.string().describe('The note global id (gid://...) from lumen_issue_get.'),
      body: z.string(),
    },
    handler: async (a) => {
      const me = await gql<{ currentUser: { username: string } | null }>(CURRENT_USER_Q)
      const myUsername = me.currentUser?.username
      if (!myUsername) return errorResult('Could not resolve the current user.')

      const data = await gql<{
        project: {
          issue: {
            discussions: {
              nodes: { notes: { nodes: { id: string; author: { username: string } | null }[] } }[]
            }
          } | null
        } | null
      }>(GET_Q, { p: a.project, iid: a.iid })
      const notes = data.project?.issue?.discussions.nodes.flatMap((d) => d.notes.nodes) ?? []
      const note = notes.find((n) => n.id === a.noteId)
      if (!note) return errorResult(`Comment ${a.noteId} not found on ${a.project}#${a.iid}.`)
      if (!note.author)
        return errorResult(`Comment ${a.noteId} has no resolvable author; cannot verify ownership.`)
      if (note.author.username !== myUsername)
        return errorResult('You can only edit your own comments.')

      const res = await gql<{
        updateNote: { note: { id: string } | null; errors: string[] } | null
      }>(UPDATE_NOTE_M, { input: { id: a.noteId, body: a.body } })
      if (!res.updateNote || res.updateNote.errors.length)
        return errorResult(res.updateNote?.errors.join('; ') || 'Comment update failed.')
      emitInvalidate({ resource: 'issue', project: a.project as string, iid: a.iid as string })
      return text(`Comment ${a.noteId} on ${a.project}#${a.iid} updated.`)
    },
  },
]
