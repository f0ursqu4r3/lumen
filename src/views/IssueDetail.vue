<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useIssue } from '@/composables/useIssue'
import { useAddNote, useUpdateIssue } from '@/composables/useIssueMutations'
import AssigneeAvatar from '@/components/AssigneeAvatar.vue'
import LabelChip from '@/components/LabelChip.vue'
import StateBadge from '@/components/StateBadge.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'

const props = defineProps<{ fullPath: string; iid: string }>()
const { data: issue, isLoading, error } = useIssue(toRef(props, 'fullPath'), toRef(props, 'iid'))
const addNote = useAddNote(props.fullPath, props.iid)
const updateIssue = useUpdateIssue(props.fullPath, props.iid)

// Surfaces a failed comment/state mutation (otherwise the action fails silently).
const actionError = computed(() => addNote.error.value ?? updateIssue.error.value)

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
  <p v-else-if="isLoading" class="text-sm text-neutral-500">Loading…</p>
  <article v-else-if="issue" class="space-y-4">
    <header class="flex items-center gap-2">
      <StateBadge :state="issue.state" />
      <h1 class="text-lg font-semibold">#{{ issue.iid }} {{ issue.title }}</h1>
      <button
        type="button"
        class="ml-auto rounded border border-neutral-300 px-2 py-1 text-xs"
        :disabled="updateIssue.isPending.value"
        @click="toggleState"
      >
        {{ issue.state === 'opened' ? 'Close issue' : 'Reopen issue' }}
      </button>
    </header>
    <ErrorNotice v-if="actionError" :error="actionError" />
    <p v-if="issue.description" class="whitespace-pre-wrap text-sm">{{ issue.description }}</p>
    <div class="flex flex-wrap gap-2">
      <LabelChip v-for="l in labels" :key="l.id" :title="l.title" :color="l.color" />
    </div>
    <div class="flex flex-wrap gap-2">
      <AssigneeAvatar
        v-for="a in assignees"
        :key="a.id"
        :username="a.username"
        :avatar-url="a.avatarUrl"
      />
    </div>
    <p v-if="issue.milestone" class="text-xs text-neutral-500">
      Milestone: {{ issue.milestone.title }}
    </p>
    <section class="space-y-2">
      <h2 class="text-sm font-semibold">Notes</h2>
      <ul class="space-y-2">
        <li v-for="n in notes" :key="n.id" class="rounded border border-neutral-200 p-2 text-sm">
          <span class="font-medium">{{ n.author ? '@' + n.author.username : '(deleted user)' }}</span>
          <span class="ml-2 text-xs text-neutral-400">{{ new Date(n.createdAt).toLocaleString() }}</span>
          <p class="mt-1 whitespace-pre-wrap">{{ n.body }}</p>
        </li>
      </ul>
      <form class="space-y-2" @submit.prevent="submitComment">
        <textarea
          v-model="comment"
          rows="3"
          placeholder="Add a comment…"
          class="w-full rounded border border-neutral-300 p-2 text-sm"
        ></textarea>
        <button
          type="submit"
          class="rounded bg-neutral-900 px-3 py-1 text-sm text-white"
          :disabled="addNote.isPending.value"
        >
          Comment
        </button>
      </form>
    </section>
  </article>
  <p v-else class="text-sm text-neutral-500">Issue not found.</p>
</template>
