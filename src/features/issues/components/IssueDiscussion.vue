<script setup lang="ts">
import { computed, ref } from 'vue'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import MarkdownText from '@/shared/components/MarkdownText.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import { useIssueDiscussion } from '@/features/issues/composables/useIssueDiscussion'
import MentionTextarea from '@/features/issues/components/MentionTextarea.vue'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'

type NoteAuthor = { name?: string | null; username: string } | null | undefined
type Note = { id: string; body: string; author?: NoteAuthor; createdAt: string }
type Thread = { id: string; notes: Note[] }

const props = defineProps<{
  threads: Thread[]
  notes: { id: string }[]
  iid: string
  issue: { id: string } | null | undefined
  fullPath: string
  members: ProjectMember[]
}>()
const comment = defineModel<string>('comment', { required: true })
const mentionOpen = ref(false)

const {
  fresh,
  replyingTo,
  replyBody,
  replyPending,
  replyError,
  openReply,
  cancelReply,
  submitReply,
} = useIssueDiscussion({
  fullPath: props.fullPath,
  iid: props.iid,
  issue: computed(() => props.issue),
  notes: computed(() => props.notes),
})

function nameOrUsername(user?: NoteAuthor) {
  return user?.name || `@${user?.username}` || '(deleted user)'
}
// Two-letter monogram for the discussion avatars (avatars are always initials here).
function initials(user?: NoteAuthor) {
  const src = (user?.name || user?.username || '?').trim()
  const parts = src.split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase()
}
</script>

<template>
  <!-- Discussion: flat thread, no boxed cards. -->
  <section
    class="issue__talk min-w-0 animate-row-in"
    :class="mentionOpen && 'issue__talk--mentions-open'"
    style="animation-delay: 140ms"
  >
    <div class="flex items-baseline gap-2">
      <span class="field-label">Discussion</span>
      <span v-if="notes.length" class="font-mono text-xs text-muted-foreground">
        {{ notes.length }}
      </span>
    </div>

    <ul v-if="threads.length" class="mt-3 divide-y divide-border/60">
      <li v-for="t in threads" :key="t.id" class="py-4 first:pt-0">
        <!-- First note is the comment; the rest are replies, indented to align
             under the comment's content (size-7 avatar + gap-3 = pl-10). -->
        <div
          v-for="(n, i) in t.notes"
          :key="n.id"
          data-testid="note"
          class="flex gap-3"
          :class="[i > 0 && 'mt-4 pl-10', fresh.has(n.id) && 'animate-note-in']"
        >
          <Avatar class="mt-0.5 size-7 shrink-0 text-2xs ring-1 ring-border/70">
            <AvatarFallback>{{ initials(n.author) }}</AvatarFallback>
          </Avatar>
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-medium text-foreground">
                {{ nameOrUsername(n.author) }}
              </span>
              <span class="font-mono text-xs text-muted-foreground">
                {{ new Date(n.createdAt).toLocaleDateString() }}
              </span>
            </div>
            <MarkdownText
              :source="n.body"
              :project-path="fullPath"
              class="mt-1 max-w-[68ch] text-sm leading-relaxed"
            />
          </div>
        </div>

        <!-- Per-thread reply, aligned with the thread content past the avatar. -->
        <div class="mt-2 pl-10">
          <Button
            v-if="replyingTo !== t.id"
            type="button"
            variant="ghost"
            size="sm"
            class="-ml-3 h-7 px-3 text-xs text-muted-foreground"
            @click="openReply(t.id)"
          >
            Reply
          </Button>
          <div v-else class="space-y-2">
            <MentionTextarea
              v-model="replyBody"
              :members="members"
              :rows="2"
              placeholder="Write a reply…"
              aria-label="Write a reply"
              @keydown.esc="cancelReply"
              @open-change="mentionOpen = $event"
            />
            <ErrorNotice v-if="replyError" :error="replyError" />
            <div class="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                :disabled="replyPending || !replyBody.trim()"
                @click="submitReply(t.id)"
              >
                {{ replyPending ? 'Replying…' : 'Reply' }}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                :disabled="replyPending"
                @click="cancelReply"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="mt-3 text-sm text-muted-foreground">
      No discussion yet — leave the first note below.
    </p>

    <div class="mt-4 space-y-1.5">
      <label for="issue-comment" class="field-label">Add a comment</label>
      <MentionTextarea
        id="issue-comment"
        v-model="comment"
        :members="members"
        :rows="3"
        placeholder="Add a comment…"
        aria-label="Add a comment"
        @open-change="mentionOpen = $event"
      />
    </div>
  </section>
</template>
