import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { mrKey } from '@/features/merge_requests/lib/mrView'

const CreateNoteDocument = `
  mutation CreateMrNote($input: CreateNoteInput!) {
    createNote(input: $input) {
      note { id }
      errors
    }
  }
`

type CreateNoteResult = {
  createNote?: { note?: { id: string } | null; errors?: string[] | null } | null
}

type NoteInput = { noteableId: string; discussionId: string; body: string }

async function sendCreateNote(input: NoteInput): Promise<CreateNoteResult['createNote']> {
  let data: CreateNoteResult
  try {
    data = await gqlClient.request<CreateNoteResult, { input: NoteInput }>(CreateNoteDocument, {
      input,
    })
  } catch (e) {
    throw normalizeError(e)
  }
  // GitLab returns mutation-level failures (e.g. permission denied) in `errors`
  // with a 200, so surface them rather than resolving with a null note.
  const errors = data.createNote?.errors
  if (errors?.length) throw { kind: 'graphql', message: errors[0] } satisfies GitLabError
  return data.createNote ?? null
}

/**
 * Reply within an MR discussion thread. `discussionId` makes the note a reply
 * within that thread; `noteableId` is the MR's global id. Invalidates the MR
 * detail query so the reply lands on the next refetch.
 */
export function useMrAddNote(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation<CreateNoteResult['createNote'], GitLabError, NoteInput>({
    mutationFn: sendCreateNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: mrKey(fullPath, iid) }),
  })
}
