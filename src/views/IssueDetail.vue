<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useIssue } from '@/composables/useIssue'
import { useAddNote, useUpdateIssue } from '@/composables/useIssueMutations'
import AssigneeAvatar from '@/components/AssigneeAvatar.vue'
import LabelChip from '@/components/LabelChip.vue'
import StateBadge from '@/components/StateBadge.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { renderMarkdown } from '@/lib/markdown'

const props = defineProps<{ fullPath: string; iid: string }>()
const { data: issue, isLoading, error } = useIssue(toRef(props, 'fullPath'), toRef(props, 'iid'))
const addNote = useAddNote(props.fullPath, props.iid)
const updateIssue = useUpdateIssue(props.fullPath, props.iid)

// Surfaces a failed comment/state mutation (otherwise the action fails silently).
const actionError = computed(() => addNote.error.value ?? updateIssue.error.value)

// GitLab descriptions are Markdown; renderMarkdown sanitizes before v-html.
const renderedDescription = computed(() => renderMarkdown(issue.value?.description))

const labels = computed(
  () => issue.value?.labels?.nodes?.filter((l): l is NonNullable<typeof l> => !!l) ?? [],
)
const assignees = computed(
  () => issue.value?.assignees?.nodes?.filter((a): a is NonNullable<typeof a> => !!a) ?? [],
)
// User comments only — system notes ("changed milestone", "closed via …") are noise here.
const notes = computed(
  () => issue.value?.notes?.nodes?.filter((n): n is NonNullable<typeof n> => !!n && !n.system) ?? [],
)

const comment = ref('')
function submitComment() {
  if (!issue.value || !comment.value.trim()) return
  addNote.mutate(
    { noteableId: issue.value.id, body: comment.value },
    { onSuccess: () => (comment.value = '') },
  )
}
function toggleState() {
  if (!issue.value) return
  updateIssue.mutate({ stateEvent: issue.value.state === 'opened' ? 'CLOSE' : 'REOPEN' })
}
</script>

<template>
  <ErrorNotice v-if="error" :error="error" />
  <div v-else-if="isLoading" class="space-y-3">
    <Skeleton class="h-7 w-2/3" />
    <Skeleton class="h-24 w-full" />
  </div>
  <article v-else-if="issue" class="space-y-4">
    <header class="flex items-center gap-2">
      <StateBadge :state="issue.state" />
      <h1 class="text-lg font-semibold">#{{ issue.iid }} {{ issue.title }}</h1>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="ml-auto"
        :disabled="updateIssue.isPending.value"
        @click="toggleState"
      >
        {{ issue.state === 'opened' ? 'Close issue' : 'Reopen issue' }}
      </Button>
    </header>

    <ErrorNotice v-if="actionError" :error="actionError" />

    <!-- eslint-disable-next-line vue/no-v-html — sanitized in renderMarkdown -->
    <div v-if="issue.description" class="markdown text-sm" v-html="renderedDescription" />

    <div v-if="labels.length" class="flex flex-wrap gap-2">
      <LabelChip v-for="l in labels" :key="l.id" :title="l.title" :color="l.color" />
    </div>
    <div v-if="assignees.length" class="flex flex-wrap gap-2">
      <AssigneeAvatar
        v-for="a in assignees"
        :key="a.id"
        :username="a.username"
        :avatar-url="a.avatarUrl"
      />
    </div>
    <p v-if="issue.milestone" class="text-xs text-muted-foreground">
      Milestone: {{ issue.milestone.title }}
    </p>

    <section class="space-y-3">
      <h2 class="text-sm font-semibold">Notes</h2>
      <Card v-for="n in notes" :key="n.id" class="py-0">
        <CardContent class="px-3 py-2 text-sm">
          <span class="font-medium">{{ n.author ? '@' + n.author.username : '(deleted user)' }}</span>
          <span class="ml-2 text-xs text-muted-foreground">
            {{ new Date(n.createdAt).toLocaleString() }}
          </span>
          <p class="mt-1 whitespace-pre-wrap">{{ n.body }}</p>
        </CardContent>
      </Card>
      <form class="space-y-2" @submit.prevent="submitComment">
        <Textarea v-model="comment" :rows="3" placeholder="Add a comment…" />
        <Button type="submit" :disabled="addNote.isPending.value">Comment</Button>
      </form>
    </section>
  </article>
  <p v-else class="text-sm text-muted-foreground">Issue not found.</p>
</template>

<style scoped>
/* Preflight strips list/heading styling; restore the basics for rendered markdown. */
.markdown :deep(:first-child) {
  margin-top: 0;
}
.markdown :deep(:last-child) {
  margin-bottom: 0;
}
.markdown :deep(p) {
  margin: 0.5rem 0;
}
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
  font-weight: 600;
  margin: 0.75rem 0 0.25rem;
}
.markdown :deep(h1) {
  font-size: 1.125rem;
}
.markdown :deep(h2) {
  font-size: 1rem;
}
.markdown :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.markdown :deep(ol) {
  list-style: decimal;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}
.markdown :deep(li) {
  margin: 0.125rem 0;
}
.markdown :deep(a) {
  color: var(--primary);
  text-decoration: underline;
}
.markdown :deep(code) {
  background: var(--muted);
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
}
.markdown :deep(pre) {
  background: var(--muted);
  padding: 0.75rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}
.markdown :deep(pre code) {
  background: transparent;
  padding: 0;
}
.markdown :deep(blockquote) {
  border-left: 3px solid var(--border);
  padding-left: 0.75rem;
  color: var(--muted-foreground);
  margin: 0.5rem 0;
}
.markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.5rem 0;
}
.markdown :deep(th),
.markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 0.25rem 0.5rem;
}
.markdown :deep(img) {
  max-width: 100%;
}
</style>
