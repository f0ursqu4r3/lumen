import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

const CreateIssueDocument = graphql(`
  mutation CreateIssue($input: CreateIssueInput!) {
    createIssue(input: $input) {
      issue {
        iid
      }
      errors
    }
  }
`)
const CreateNoteDocument = graphql(`
  mutation CreateNote($input: CreateNoteInput!) {
    createNote(input: $input) {
      note {
        id
      }
      errors
    }
  }
`)
const UpdateIssueDocument = graphql(`
  mutation UpdateIssue($input: UpdateIssueInput!) {
    updateIssue(input: $input) {
      issue {
        iid
        state
      }
      errors
    }
  }
`)
// Assignees live on a dedicated mutation — UpdateIssueInput has no assignee
// field on this instance. Defaults to REPLACE, so the username list we send
// becomes the full assignee set (an empty list clears all assignees).
const SetAssigneesDocument = graphql(`
  mutation SetAssignees($input: IssueSetAssigneesInput!) {
    issueSetAssignees(input: $input) {
      issue {
        iid
      }
      errors
    }
  }
`)

// Only models the `errors[]` field that `run` inspects — not the full payload.
type ErrorsCarrier = { errors: string[] } | null | undefined

// Sends the request, normalizes transport errors, and rejects with a typed
// GitLabError when the mutation payload carries errors[].
async function run<P extends ErrorsCarrier>(
  send: () => Promise<unknown>,
  pick: (data: never) => P,
): Promise<NonNullable<P>> {
  let data: unknown
  try {
    data = await send()
  } catch (e) {
    throw normalizeError(e)
  }
  const payload = pick(data as never)
  if (payload?.errors?.length) {
    throw { kind: 'graphql', message: payload.errors[0] } satisfies GitLabError
  }
  return payload as NonNullable<P>
}

type CreateIssuePayload = { issue?: { iid: string } | null; errors: string[] }
type CreateNotePayload = { note?: { id: string } | null; errors: string[] }
type UpdateIssuePayload = {
  issue?: { iid: string; state: string } | null
  errors: string[]
}
type SetAssigneesPayload = {
  issue?: { iid: string } | null
  errors: string[]
}

export function useCreateIssue(fullPath: string) {
  const qc = useQueryClient()
  return useMutation<
    CreateIssuePayload,
    GitLabError,
    {
      title: string
      description?: string
      labels?: string[]
      assigneeIds?: string[]
    }
  >({
    mutationFn: (input) =>
      run(
        () =>
          gqlClient.request(CreateIssueDocument, {
            input: { projectPath: fullPath, ...input },
          }),
        (d: { createIssue?: CreateIssuePayload | null }) => d.createIssue,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', fullPath] }),
  })
}

// `discussionId` makes the note a reply within that thread; omit it to start a
// new top-level discussion. `noteableId` (the issue gid) is required either way.
export function useAddNote(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation<
    CreateNotePayload,
    GitLabError,
    { noteableId: string; body: string; discussionId?: string }
  >({
    mutationFn: (input) =>
      run(
        () => gqlClient.request(CreateNoteDocument, { input }),
        (d: { createNote?: CreateNotePayload | null }) => d.createNote,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issue', fullPath, iid] }),
  })
}

type LabelNode = { id: string; title: string; color: string }
type RetagVars = {
  iid: string
  addLabelIds: string[]
  removeLabelIds: string[]
  nextLabels: LabelNode[]
}
// Shape of the cached infinite-issues data we patch optimistically.
type IssuesCache =
  | { pages: { nodes: { iid: string; labels: { nodes: LabelNode[] } }[] }[] }
  | null
  | undefined

/**
 * Move an issue between board columns by swapping its scoped label. Optimistically
 * patches the issues cache so the card jumps instantly, rolling back on error.
 */
export function useRetagIssue(fullPath: string) {
  const qc = useQueryClient()
  return useMutation<
    UpdateIssuePayload,
    GitLabError,
    RetagVars,
    { previous: [readonly unknown[], unknown][] }
  >({
    mutationFn: ({ iid, addLabelIds, removeLabelIds }) =>
      run(
        () =>
          gqlClient.request(UpdateIssueDocument, {
            input: { projectPath: fullPath, iid, addLabelIds, removeLabelIds },
          }),
        (d: { updateIssue?: UpdateIssuePayload | null }) => d.updateIssue,
      ),
    onMutate: async ({ iid, nextLabels }) => {
      await qc.cancelQueries({ queryKey: ['issues', fullPath] })
      const previous = qc.getQueriesData({ queryKey: ['issues', fullPath] })
      qc.setQueriesData({ queryKey: ['issues', fullPath] }, (old: IssuesCache) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            nodes: p.nodes.map((n) =>
              n.iid === iid ? { ...n, labels: { nodes: nextLabels } } : n,
            ),
          })),
        }
      })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['issues', fullPath] }),
  })
}

export function useUpdateIssue(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation<
    UpdateIssuePayload,
    GitLabError,
    {
      title?: string
      description?: string
      stateEvent?: 'CLOSE' | 'REOPEN'
      addLabelIds?: string[]
      removeLabelIds?: string[]
    }
  >({
    mutationFn: (changes) =>
      run(
        () =>
          gqlClient.request(UpdateIssueDocument, {
            input: { projectPath: fullPath, iid, ...changes },
          }),
        (d: { updateIssue?: UpdateIssuePayload | null }) => d.updateIssue,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', fullPath, iid] })
      qc.invalidateQueries({ queryKey: ['issues', fullPath] })
    },
  })
}

// Replace an issue's assignees with the given usernames (empty list unassigns
// everyone). Separate from useUpdateIssue because GitLab models assignment as a
// distinct mutation, not a field on UpdateIssueInput.
export function useSetAssignees(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation<SetAssigneesPayload, GitLabError, { assigneeUsernames: string[] }>({
    mutationFn: ({ assigneeUsernames }) =>
      run(
        () =>
          gqlClient.request(SetAssigneesDocument, {
            input: { projectPath: fullPath, iid, assigneeUsernames },
          }),
        (d: { issueSetAssignees?: SetAssigneesPayload | null }) => d.issueSetAssignees,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', fullPath, iid] })
      qc.invalidateQueries({ queryKey: ['issues', fullPath] })
    },
  })
}
