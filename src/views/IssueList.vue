<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useIssues } from '@/composables/useIssues'
import { useCreateIssue } from '@/composables/useIssueMutations'
import type { IssueFilters } from '@/gitlab/issueParams'
import IssueRow from '@/components/IssueRow.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'

const props = defineProps<{ fullPath: string }>()

// Raw text inputs; mapped into IssueFilters (labels is comma-separated).
const state = ref<IssueFilters['state']>('opened')
const search = ref('')
const labelsText = ref('')
const assignee = ref('')
const milestone = ref('')

const filters = computed<IssueFilters>(() => ({
  state: state.value,
  search: search.value || undefined,
  labels: labelsText.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  assignee: assignee.value || undefined,
  milestone: milestone.value || undefined,
}))

const { data, isLoading, error } = useIssues(toRef(props, 'fullPath'), filters)
const createIssue = useCreateIssue(props.fullPath)
const newTitle = ref('')
function submitNew() {
  if (!newTitle.value.trim()) return
  createIssue.mutate({ title: newTitle.value }, { onSuccess: () => (newTitle.value = '') })
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-lg font-semibold">Issues — {{ fullPath }}</h1>
    <div class="flex flex-wrap gap-2">
      <select v-model="state" class="rounded border border-neutral-300 px-2 py-1 text-sm">
        <option value="opened">Open</option>
        <option value="closed">Closed</option>
        <option value="all">All</option>
      </select>
      <input
        v-model="search"
        type="search"
        placeholder="Search issues…"
        class="flex-1 rounded border border-neutral-300 px-3 py-1 text-sm"
      />
      <input
        v-model="labelsText"
        placeholder="Labels (comma-separated)"
        class="rounded border border-neutral-300 px-3 py-1 text-sm"
      />
      <input
        v-model="assignee"
        placeholder="Assignee username"
        class="rounded border border-neutral-300 px-3 py-1 text-sm"
      />
      <input
        v-model="milestone"
        placeholder="Milestone"
        class="rounded border border-neutral-300 px-3 py-1 text-sm"
      />
    </div>
    <form class="flex gap-2" @submit.prevent="submitNew">
      <input
        v-model="newTitle"
        placeholder="New issue title…"
        class="flex-1 rounded border border-neutral-300 px-3 py-1 text-sm"
      />
      <button
        type="submit"
        class="rounded bg-neutral-900 px-3 py-1 text-sm text-white"
        :disabled="createIssue.isPending.value"
      >
        Create
      </button>
    </form>
    <ErrorNotice v-if="createIssue.error.value" :error="createIssue.error.value" />
    <ErrorNotice v-if="error" :error="error" />
    <p v-else-if="isLoading" class="text-sm text-neutral-500">Loading…</p>
    <template v-else>
      <ul
        v-if="data?.nodes.length"
        class="divide-y divide-neutral-200 rounded border border-neutral-200"
      >
        <li v-for="issue in data.nodes" :key="issue.iid">
          <IssueRow :issue="issue" :full-path="fullPath" />
        </li>
      </ul>
      <p v-else class="text-sm text-neutral-500">No issues.</p>
    </template>
  </section>
</template>
