import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

const CreateIssueDocument = graphql(`
  mutation CreateIssue($input: CreateIssueInput!) {
    createIssue(input: $input) { issue { iid } errors }
  }
`)
const CreateNoteDocument = graphql(`
  mutation CreateNote($input: CreateNoteInput!) {
    createNote(input: $input) { note { id } errors }
  }
`)
const UpdateIssueDocument = graphql(`
  mutation UpdateIssue($input: UpdateIssueInput!) {
    updateIssue(input: $input) { issue { iid state } errors }
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
type UpdateIssuePayload = { issue?: { iid: string; state: string } | null; errors: string[] }

export function useCreateIssue(fullPath: string) {
  const qc = useQueryClient()
  return useMutation<CreateIssuePayload, GitLabError, { title: string; description?: string }>({
    mutationFn: (input) =>
      run(
        () => gqlClient.request(CreateIssueDocument, { input: { projectPath: fullPath, ...input } }),
        (d: { createIssue?: CreateIssuePayload | null }) => d.createIssue,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', fullPath] }),
  })
}

export function useAddNote(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation<CreateNotePayload, GitLabError, { noteableId: string; body: string }>({
    mutationFn: (input) =>
      run(
        () => gqlClient.request(CreateNoteDocument, { input }),
        (d: { createNote?: CreateNotePayload | null }) => d.createNote,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issue', fullPath, iid] }),
  })
}

export function useUpdateIssue(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation<
    UpdateIssuePayload,
    GitLabError,
    {
      stateEvent?: 'CLOSE' | 'REOPEN'
      addLabelIds?: string[]
      removeLabelIds?: string[]
      assigneeUsernames?: string[]
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
