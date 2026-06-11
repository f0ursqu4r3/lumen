<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import MarkdownText from '@/shared/components/MarkdownText.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import {
  useMrAddNote,
  useMrUpdateNote,
} from '@/features/merge_requests/composables/useMrDiscussion'
import { useCurrentUser } from '@/features/dashboard/composables/useCurrentUser'

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

// Inline edit-in-place for the current user's own notes. The Edit control is
// hidden and the editor shown for the active note (Save disabled while pending),
// so an edit can't be opened on another note while a submit is in flight.
const editMut = useMrUpdateNote(props.fullPath, props.iid)
const editingNoteId = ref<string | null>(null)
const editBody = ref('')
const { data: currentUsername } = useCurrentUser()
function isOwn(note: Note) {
  return !!currentUsername.value && note.author?.username === currentUsername.value
}
function openEdit(note: Note) {
  editingNoteId.value = note.id
  editBody.value = note.body
  editMut.reset()
}
function cancelEdit() {
  editingNoteId.value = null
  editBody.value = ''
}
async function submitEdit(noteId: string) {
  const text = editBody.value.trim()
  if (!text || editMut.isPending.value) return
  try {
    await editMut.mutateAsync({ id: noteId, body: text })
    cancelEdit()
  } catch {
    /* error surfaces below; keep the editor open */
  }
}

const nameOf = (a: NoteAuthor) => a?.name || a?.username || 'unknown'
</script>

<template>
  <div class="space-y-6">
    <div v-for="thread in threads" :key="thread.id" class="rounded-lg border border-border/60 p-3">
      <div v-for="note in thread.notes" :key="note.id" class="group/note mb-3 last:mb-0">
        <div class="flex items-baseline gap-2">
          <p class="text-xs text-muted-foreground">{{ nameOf(note.author) }}</p>
          <Button
            v-if="isOwn(note) && editingNoteId !== note.id"
            type="button"
            size="sm"
            variant="ghost"
            class="ml-auto h-6 px-2 text-xs opacity-0 transition group-hover/note:opacity-100 focus-visible:opacity-100"
            @click="openEdit(note)"
          >
            Edit
          </Button>
        </div>
        <MarkdownText v-if="editingNoteId !== note.id" :source="note.body" class="prose-sm" />
        <div v-else class="mt-1 space-y-2">
          <Textarea v-model="editBody" rows="3" aria-label="Edit comment" />
          <ErrorNotice v-if="editMut.error.value" :error="editMut.error.value" />
          <div class="flex gap-2">
            <Button
              type="button"
              size="sm"
              :disabled="editMut.isPending.value || !editBody.trim()"
              @click="submitEdit(note.id)"
            >
              {{ editMut.isPending.value ? 'Saving…' : 'Save' }}
            </Button>
            <Button type="button" size="sm" variant="ghost" @click="cancelEdit">Cancel</Button>
          </div>
        </div>
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
