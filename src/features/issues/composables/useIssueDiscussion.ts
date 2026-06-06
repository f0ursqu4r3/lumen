import { computed, ref, watch, type Ref } from 'vue'
import { useAddNote } from '@/features/issues/composables/useIssueMutations'

export function useIssueDiscussion(opts: {
  fullPath: string
  iid: string
  issue: Ref<{ id: string } | null | undefined>
  notes: Ref<{ id: string }[]>
}) {
  // Only notes that arrive *after* the thread first renders should animate in;
  // the initial set lands with the section's own entrance. We prime `seen` on the
  // first resolve (nothing flagged fresh), then any later id is a new comment —
  // flag it so its <li> eases in, and drop the flag once the animation has played
  // so an unrelated re-render can't replay it.
  const seen = new Set<string>()
  const fresh = ref(new Set<string>())
  let primed = false

  watch(
    () => opts.notes.value.map((n) => n.id),
    (ids) => {
      if (!primed) {
        // Wait for the first real resolve; priming on the pre-load empty set would
        // make the whole initial thread count as "arrived" and animate at once.
        if (!opts.issue.value) return
        ids.forEach((id) => seen.add(id))
        primed = true
        return
      }
      const arrived = ids.filter((id) => !seen.has(id))
      if (!arrived.length) return
      arrived.forEach((id) => {
        seen.add(id)
        fresh.value.add(id)
      })
      // Drop the flag after the animation completes (Vue tracks Set mutations).
      setTimeout(() => arrived.forEach((id) => fresh.value.delete(id)), 1500)
    },
    { immediate: true },
  )

  // Replies post immediately (their own per-thread box), independent of the draft
  // buffer that batches field edits + the top-level comment behind Save. One box
  // open at a time keeps the state flat; the mutation invalidates the issue query
  // so the new reply lands on the next refetch.
  const reply = useAddNote(opts.fullPath, opts.iid)
  const replyingTo = ref<string | null>(null)
  const replyBody = ref('')
  const replyPending = computed(() => reply.isPending.value)
  const replyError = computed(() => reply.error.value)

  function openReply(threadId: string) {
    replyingTo.value = threadId
    replyBody.value = ''
    reply.reset()
  }
  function cancelReply() {
    replyingTo.value = null
    replyBody.value = ''
  }
  async function submitReply(threadId: string) {
    const body = replyBody.value.trim()
    if (!body || !opts.issue.value?.id || reply.isPending.value) return
    try {
      await reply.mutateAsync({ noteableId: opts.issue.value.id, discussionId: threadId, body })
      cancelReply()
    } catch {
      // Left open with the text intact; the error surfaces via reply.error below.
    }
  }

  return {
    fresh,
    replyingTo,
    replyBody,
    replyPending,
    replyError,
    openReply,
    cancelReply,
    submitReply,
  }
}
