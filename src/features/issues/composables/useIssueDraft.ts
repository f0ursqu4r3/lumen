import { computed, ref, watch, type Ref } from 'vue'
import {
  useAddNote,
  useSetAssignees,
  useUpdateIssue,
} from '@/features/issues/composables/useIssueMutations'
import {
  useSetWorkItemStatus,
  useWorkItemStatus,
} from '@/features/issues/composables/useWorkItemStatus'
import {
  diffIssueEdit,
  draftFromIssue,
  isDirty,
  type IssueDraft,
} from '@/features/issues/lib/issueEdit'

// The issue must also carry `id` (the gid) so a pending comment can be posted.
type IssueLike = (Parameters<typeof draftFromIssue>[0] & { id?: string }) | null | undefined

/**
 * Buffers issue edits: a local `draft` seeded from the server issue, a pending
 * `comment`, a `dirty` flag, and `save()` that fires only the mutations the diff
 * requires plus the comment when present. The draft re-syncs from the server
 * only while clean, so a background refetch never clobbers in-flight edits.
 */
export function useIssueDraft(fullPath: string, iid: string, issue: Ref<IssueLike>) {
  const update = useUpdateIssue(fullPath, iid)
  const setAssignees = useSetAssignees(fullPath, iid)
  const addNote = useAddNote(fullPath, iid)
  // Work-item Status lives behind its own query/mutation, but is buffered into
  // the draft and persisted by save() like every other field — nothing here is
  // applied independently of Save.
  const statusQuery = useWorkItemStatus(ref(fullPath), ref(iid))
  const setStatus = useSetWorkItemStatus(ref(fullPath), ref(iid))
  const statusState = statusQuery.data

  const original = ref<IssueDraft | null>(null)
  const draft = ref<IssueDraft | null>(null)
  const comment = ref('')

  const cloneDraft = (d: IssueDraft): IssueDraft => ({
    ...d,
    labelIds: [...d.labelIds],
    assigneeUsernames: [...d.assigneeUsernames],
  })

  function sync() {
    if (!issue.value) return
    const statusId = statusState.value?.status?.id ?? null
    original.value = draftFromIssue(issue.value, statusId)
    draft.value = draftFromIssue(issue.value, statusId)
  }

  const dirty = computed(
    () =>
      (!!original.value && !!draft.value && isDirty(original.value, draft.value)) ||
      comment.value.trim() !== '',
  )
  const saving = computed(
    () =>
      update.isPending.value ||
      setAssignees.isPending.value ||
      addNote.isPending.value ||
      setStatus.isPending.value,
  )
  const error = computed(
    () =>
      update.error.value ??
      setAssignees.error.value ??
      addNote.error.value ??
      setStatus.error.value ??
      null,
  )

  // Re-seed while clean whenever the issue *or* its status resolves/refetches, so
  // a status that loads after the issue still lands in the buffer.
  watch(
    [issue, () => statusState.value],
    () => {
      if (!draft.value || !dirty.value) sync()
    },
    { immediate: true },
  )

  async function save() {
    if (!original.value || !draft.value) return
    const diff = diffIssueEdit(original.value, draft.value)
    const body = comment.value.trim()
    const workItemId = statusState.value?.workItemId
    try {
      if (diff.update) await update.mutateAsync(diff.update)
      if (diff.assignees) await setAssignees.mutateAsync({ assigneeUsernames: diff.assignees })
      if (diff.statusId && workItemId)
        await setStatus.mutateAsync({ workItemId, statusId: diff.statusId })
      if (body && issue.value?.id)
        await addNote.mutateAsync({
          noteableId: issue.value.id,
          body,
        })
      // Mark clean immediately so the Save/Cancel footer hides; the mutations
      // invalidate the issue query, and the resulting refetch then re-syncs the
      // buffer normally (it is no longer dirty, so the watcher's guard allows it).
      original.value = cloneDraft(draft.value)
      comment.value = ''
    } catch {
      // Surfaced via the `error` computed; leave the draft + comment intact so
      // the user can retry or cancel.
    }
  }

  function reset() {
    sync()
    comment.value = ''
  }

  return { draft, comment, dirty, saving, error, save, reset }
}
