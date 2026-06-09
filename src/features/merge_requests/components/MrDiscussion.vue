<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import MarkdownText from '@/shared/components/MarkdownText.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import { useMrAddNote } from '@/features/merge_requests/composables/useMrDiscussion'

type NoteAuthor = { name?: string | null; username: string } | null | undefined
type Note = { id: string; body: string; system: boolean; createdAt: string; author?: NoteAuthor }
type Thread = { id: string; notes: Note[] }

const props = defineProps<{
  threads: Thread[]
  fullPath: string
  iid: string
  mrId: string
}>()

const reply = useMrAddNote(props.fullPath, props.iid)
const replyingTo = ref<string | null>(null)
const body = ref('')

function open(threadId: string) {
  replyingTo.value = threadId
  body.value = ''
  reply.reset()
}
function cancel() {
  replyingTo.value = null
  body.value = ''
}
async function submit(threadId: string) {
  const text = body.value.trim()
  if (!text || reply.isPending.value) return
  try {
    await reply.mutateAsync({ noteableId: props.mrId, discussionId: threadId, body: text })
    cancel()
  } catch {
    /* error surfaces below; keep the box open */
  }
}
const nameOf = (a: NoteAuthor) => a?.name || a?.username || 'unknown'
</script>

<template>
  <div class="space-y-6">
    <div v-for="thread in threads" :key="thread.id" class="rounded-lg border border-border/60 p-3">
      <div v-for="note in thread.notes" :key="note.id" class="mb-3 last:mb-0">
        <p class="text-xs text-muted-foreground">{{ nameOf(note.author) }}</p>
        <MarkdownText :source="note.body" class="prose-sm" />
      </div>

      <div v-if="replyingTo === thread.id" class="mt-2 space-y-2">
        <Textarea v-model="body" rows="3" placeholder="Reply…" aria-label="Reply" />
        <ErrorNotice v-if="reply.error.value" :error="reply.error.value" />
        <div class="flex gap-2">
          <Button size="sm" :disabled="reply.isPending.value" @click="submit(thread.id)">
            {{ reply.isPending.value ? 'Posting…' : 'Reply' }}
          </Button>
          <Button size="sm" variant="ghost" @click="cancel">Cancel</Button>
        </div>
      </div>
      <Button v-else size="sm" variant="ghost" class="mt-1" @click="open(thread.id)">Reply</Button>
    </div>
  </div>
</template>
