import { z } from 'zod'
import type { McpTool } from '../types'
import { text, errorResult, iidParam } from '../types'
import { gql, rest } from './client'

const LIST_Q = `query($p:ID!,$state:MergeRequestState,$labelName:[String],$authorUsername:String,$reviewerUsername:String,$search:String,$first:Int,$after:String){
  project(fullPath:$p){ mergeRequests(state:$state,labelName:$labelName,authorUsername:$authorUsername,reviewerUsername:$reviewerUsername,search:$search,first:$first,after:$after,sort:UPDATED_DESC){
    nodes{ iid title state webUrl updatedAt draft sourceBranch targetBranch author{username} reviewers{nodes{username}} labels{nodes{title}} }
    pageInfo{ endCursor hasNextPage } } } }`

const GET_Q = `query($p:ID!,$iid:String!){
  project(fullPath:$p){ mergeRequest(iid:$iid){
    iid title state description webUrl createdAt updatedAt draft sourceBranch targetBranch
    author{username} reviewers{nodes{username}} labels{nodes{title}}
    approved approvedBy{nodes{username}} commitCount detailedMergeStatus
    diffStatsSummary{additions deletions fileCount}
    discussions{nodes{notes{nodes{id body author{username} createdAt}}}} } } }`

const ID_Q = `query($p:ID!,$iid:String!){project(fullPath:$p){mergeRequest(iid:$iid){id}}}`
const NOTE_M = `mutation($input:CreateNoteInput!){createNote(input:$input){note{id} errors}}`
const CURRENT_USER_Q = `{currentUser{username}}`
const UPDATE_NOTE_M = `mutation($input:UpdateNoteInput!){updateNote(input:$input){note{id} errors}}`

export const mrTools: McpTool[] = [
  {
    name: 'lumen_mrs_list',
    description:
      'List merge requests in a project, filtered by state, labels, author, reviewer, or search text.',
    inputSchema: {
      project: z.string(),
      state: z.enum(['opened', 'closed', 'merged', 'all']).optional(),
      labels: z.array(z.string()).optional(),
      authorUsername: z.string().optional(),
      reviewerUsername: z.string().optional(),
      search: z.string().optional(),
      first: z.number().int().min(1).max(100).optional().default(20),
      after: z.string().optional(),
    },
    handler: async (a) => {
      const data = await gql<{
        project: { mergeRequests: { nodes: unknown[]; pageInfo: unknown } } | null
      }>(LIST_Q, {
        p: a.project,
        state: a.state === 'all' ? null : (a.state ?? null),
        labelName: (a.labels as string[] | undefined) ?? null,
        authorUsername: a.authorUsername ?? null,
        reviewerUsername: a.reviewerUsername ?? null,
        search: a.search ?? null,
        first: a.first ?? 20,
        after: a.after ?? null,
      })
      const conn = data.project?.mergeRequests ?? { nodes: [], pageInfo: {} }
      return text({ mergeRequests: conn.nodes, pageInfo: conn.pageInfo })
    },
  },
  {
    name: 'lumen_mr_get',
    description:
      'Get full detail for one merge request (description, diff stats, approvals, comments).',
    inputSchema: { project: z.string(), iid: iidParam },
    handler: async (a) => {
      const data = await gql<{ project: { mergeRequest: unknown } | null }>(GET_Q, {
        p: a.project,
        iid: a.iid,
      })
      if (!data.project?.mergeRequest) return errorResult(`MR ${a.iid} not found in ${a.project}.`)
      return text(data.project.mergeRequest)
    },
  },
  {
    name: 'lumen_mr_comment',
    description: 'Add a comment to a merge request.',
    inputSchema: {
      project: z.string(),
      iid: iidParam,
      body: z.string(),
    },
    handler: async (a) => {
      const idData = await gql<{
        project: { mergeRequest: { id: string } | null } | null
      }>(ID_Q, { p: a.project, iid: a.iid })
      const noteableId = idData.project?.mergeRequest?.id
      if (!noteableId) return errorResult(`MR ${a.iid} not found in ${a.project}.`)
      const data = await gql<{
        createNote: { note: { id: string } | null; errors: string[] }
      }>(NOTE_M, {
        input: { noteableId, body: a.body },
      })
      if (data.createNote.errors.length) return errorResult(data.createNote.errors.join('; '))
      return text(`Comment added to ${a.project}!${a.iid}.`)
    },
  },
  {
    name: 'lumen_mr_comment_edit',
    description:
      'Edit one of your own comments on a merge request. Pass the note id from lumen_mr_get. Refuses to edit comments authored by anyone else.',
    inputSchema: {
      project: z.string(),
      iid: iidParam,
      noteId: z.string().describe('The note global id (gid://...) from lumen_mr_get.'),
      body: z.string(),
    },
    handler: async (a) => {
      const me = await gql<{ currentUser: { username: string } | null }>(CURRENT_USER_Q)
      const myUsername = me.currentUser?.username
      if (!myUsername) return errorResult('Could not resolve the current user.')

      const data = await gql<{
        project: {
          mergeRequest: {
            discussions: {
              nodes: { notes: { nodes: { id: string; author: { username: string } | null }[] } }[]
            }
          } | null
        } | null
      }>(GET_Q, { p: a.project, iid: a.iid })
      const notes =
        data.project?.mergeRequest?.discussions.nodes.flatMap((d) => d.notes.nodes) ?? []
      const note = notes.find((n) => n.id === a.noteId)
      if (!note) return errorResult(`Comment ${a.noteId} not found on ${a.project}!${a.iid}.`)
      if (!note.author)
        return errorResult(`Comment ${a.noteId} has no resolvable author; cannot verify ownership.`)
      if (note.author.username !== myUsername)
        return errorResult('You can only edit your own comments.')

      const res = await gql<{
        updateNote: { note: { id: string } | null; errors: string[] } | null
      }>(UPDATE_NOTE_M, { input: { id: a.noteId, body: a.body } })
      if (!res.updateNote || res.updateNote.errors.length)
        return errorResult(res.updateNote?.errors.join('; ') || 'Comment update failed.')
      return text(`Comment ${a.noteId} on ${a.project}!${a.iid} updated.`)
    },
  },
  {
    name: 'lumen_mr_review',
    description: 'Approve or unapprove a merge request. (Merge is not available in this version.)',
    inputSchema: {
      project: z.string(),
      iid: iidParam,
      action: z.enum(['approve', 'unapprove']),
    },
    handler: async (a) => {
      const enc = encodeURIComponent(a.project as string)
      await rest('POST', `/v4/projects/${enc}/merge_requests/${a.iid}/${a.action}`)
      return text(`MR ${a.project}!${a.iid} ${a.action === 'approve' ? 'approved' : 'unapproved'}.`)
    },
  },
]
