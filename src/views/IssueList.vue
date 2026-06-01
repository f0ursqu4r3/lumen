<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { Plus, Search, Tag, AtSign, Milestone } from '@lucide/vue'
import { useIssues } from '@/composables/useIssues'
import { useCreateIssue } from '@/composables/useIssueMutations'
import type { IssueFilters } from '@/gitlab/issueParams'
import IssueRow from '@/components/IssueRow.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const props = defineProps<{ fullPath: string }>()

// Raw text inputs; mapped into IssueFilters (labels is comma-separated).
const state = ref<IssueFilters['state']>('opened')
const search = ref('')
const labelsText = ref('')
const assignee = ref('')
const milestone = ref('')

const STATES: { value: IssueFilters['state']; label: string }[] = [
  { value: 'opened', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

// Split the project path so the final segment (the repo) can be emphasized.
const pathParts = computed(() => props.fullPath.split('/'))
const repoName = computed(() => pathParts.value.at(-1) ?? props.fullPath)
const pathPrefix = computed(() => pathParts.value.slice(0, -1).join('/'))

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

const count = computed(() => data.value?.nodes.length ?? 0)
const hasMore = computed(() => data.value?.pageInfo.hasNextPage ?? false)

const createIssue = useCreateIssue(props.fullPath)
const newTitle = ref('')
function submitNew() {
  if (!newTitle.value.trim()) return
  createIssue.mutate(
    { title: newTitle.value },
    { onSuccess: () => (newTitle.value = '') },
  )
}
</script>

<template>
  <section class="space-y-5">
    <!-- Header -->
    <div class="flex items-end justify-between gap-4">
      <div class="min-w-0">
        <p class="font-mono text-[11px] font-medium tracking-[0.2em] text-neutral-400 uppercase">
          Issues
        </p>
        <h1 class="truncate text-2xl font-semibold tracking-tight text-neutral-900">
          {{ repoName }}
        </h1>
        <p v-if="pathPrefix" class="truncate font-mono text-xs text-neutral-400">
          {{ pathPrefix }}/
        </p>
      </div>
      <div
        class="hidden shrink-0 flex-col items-end sm:flex"
        :class="isLoading ? 'opacity-0' : 'opacity-100'"
      >
        <span class="font-mono text-3xl font-semibold tabular-nums text-neutral-900">
          {{ count }}<span v-if="hasMore" class="text-neutral-300">+</span>
        </span>
        <span class="text-xs text-neutral-400">
          {{ count === 1 ? 'issue' : 'issues' }}
        </span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="space-y-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <!-- Segmented state control -->
        <div class="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
          <button
            v-for="s in STATES"
            :key="s.value"
            type="button"
            class="rounded-[7px] px-3 py-1 text-sm font-medium transition-colors"
            :class="
              state === s.value
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-800'
            "
            @click="state = s.value"
          >
            {{ s.label }}
          </button>
        </div>

        <!-- Search -->
        <div class="relative min-w-50 flex-1">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400"
          />
          <Input
            v-model="search"
            type="search"
            placeholder="Search issues…"
            class="pl-9"
          />
        </div>
      </div>

      <!-- Secondary filters -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative w-56">
          <Tag class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <Input v-model="labelsText" placeholder="Labels (comma-separated)" class="pl-9" />
        </div>
        <div class="relative w-48">
          <AtSign class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <Input v-model="assignee" placeholder="Assignee" class="pl-9" />
        </div>
        <div class="relative w-44">
          <Milestone class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <Input v-model="milestone" placeholder="Milestone" class="pl-9" />
        </div>
      </div>
    </div>

    <!-- Quick create -->
    <form
      class="flex gap-2 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 p-2"
      @submit.prevent="submitNew"
    >
      <Input
        v-model="newTitle"
        placeholder="New issue title…"
        class="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <Button type="submit" :disabled="createIssue.isPending.value">
        <Plus />
        Create
      </Button>
    </form>

    <ErrorNotice v-if="createIssue.error.value" :error="createIssue.error.value" />
    <ErrorNotice v-if="error" :error="error" />

    <div v-else-if="isLoading" class="space-y-px overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <Skeleton v-for="i in 6" :key="i" class="h-12 w-full rounded-none" />
    </div>

    <template v-else>
      <Card
        v-if="count"
        class="gap-0 divide-y divide-neutral-100 overflow-hidden p-0 shadow-sm"
      >
        <IssueRow
          v-for="issue in data!.nodes"
          :key="issue.iid"
          :issue="issue"
          :full-path="fullPath"
        />
      </Card>

      <!-- Empty state -->
      <div
        v-else
        class="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 py-16 text-center"
      >
        <div class="grid size-11 place-items-center rounded-full bg-neutral-100">
          <Search class="size-5 text-neutral-400" />
        </div>
        <p class="text-sm font-medium text-neutral-700">No issues.</p>
        <p class="text-xs text-neutral-400">Nothing matches the current filters.</p>
      </div>
    </template>
  </section>
</template>
