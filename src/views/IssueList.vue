<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import { Plus, Search, Tag, AtSign, Milestone, LoaderCircle } from '@lucide/vue'
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

const { issues, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
  useIssues(toRef(props, 'fullPath'), filters)

const count = computed(() => issues.value.length)
const hasMore = computed(() => hasNextPage.value ?? false)

function loadMore() {
  if (hasNextPage.value && !isFetchingNextPage.value) fetchNextPage()
}

// Auto-load the next page when the sentinel scrolls into view; the button below
// is the explicit fallback (and what shows when IntersectionObserver is absent).
const sentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) loadMore()
})

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
  <section class="space-y-6">
    <!-- Header -->
    <div class="flex items-end justify-between gap-4">
      <div class="min-w-0">
        <p
          class="font-mono text-[10px] font-medium tracking-[0.28em] text-muted-foreground/70 uppercase"
        >
          Issues
        </p>
        <h1 class="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground">
          {{ repoName }}
        </h1>
        <p
          v-if="pathPrefix"
          class="truncate font-mono text-xs text-muted-foreground/60"
        >
          {{ pathPrefix }}/
        </p>
      </div>
      <div
        class="hidden shrink-0 flex-col items-end transition-opacity sm:flex"
        :class="isLoading ? 'opacity-0' : 'opacity-100'"
      >
        <span
          class="font-mono text-[2rem] leading-none font-medium tabular-nums text-foreground"
        >
          {{ count }}<span v-if="hasMore" class="text-muted-foreground/40">+</span>
        </span>
        <span class="mt-1.5 text-[11px] tracking-wide text-muted-foreground/70 uppercase">
          {{ count === 1 ? 'issue' : 'issues' }}
        </span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="space-y-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <!-- Segmented state control -->
        <div class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          <button
            v-for="s in STATES"
            :key="s.value"
            type="button"
            class="rounded-[7px] px-3 py-1 text-sm font-medium transition-colors"
            :class="
              state === s.value
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="state = s.value"
          >
            {{ s.label }}
          </button>
        </div>

        <!-- Search -->
        <div class="relative min-w-50 flex-1">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
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
          <Tag
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="labelsText"
            placeholder="Labels (comma-separated)"
            class="pl-9"
          />
        </div>
        <div class="relative w-48">
          <AtSign
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input v-model="assignee" placeholder="Assignee" class="pl-9" />
        </div>
        <div class="relative w-44">
          <Milestone
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input v-model="milestone" placeholder="Milestone" class="pl-9" />
        </div>
      </div>
    </div>

    <!-- Quick create -->
    <form
      class="group flex gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-2 transition-colors focus-within:border-primary/40 focus-within:bg-muted/30"
      @submit.prevent="submitNew"
    >
      <Input
        v-model="newTitle"
        placeholder="New issue title…"
        class="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button type="submit" :disabled="createIssue.isPending.value">
        <Plus />
        Create
      </Button>
    </form>

    <ErrorNotice v-if="createIssue.error.value" :error="createIssue.error.value" />
    <ErrorNotice v-if="error" :error="error" />

    <div
      v-else-if="isLoading"
      class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div v-for="i in 6" :key="i" class="flex items-center gap-3 px-4 py-2.5">
        <Skeleton class="size-2 rounded-full" />
        <Skeleton class="size-5 rounded-md" />
        <Skeleton class="h-3 w-8" />
        <Skeleton class="h-3.5 flex-1" :style="{ maxWidth: `${40 + ((i * 13) % 45)}%` }" />
        <Skeleton class="h-5 w-16 rounded-full" />
      </div>
    </div>

    <template v-else>
      <template v-if="count">
        <Card class="gap-0 divide-y divide-border/60 overflow-hidden p-0 shadow-sm">
          <IssueRow
            v-for="(issue, i) in issues"
            :key="issue.iid"
            :issue="issue"
            :full-path="fullPath"
            :index="i"
          />
        </Card>

        <!-- Load more: auto-triggers via the sentinel, button is the fallback. -->
        <div v-if="hasMore" ref="sentinel" class="flex justify-center pt-3">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            :disabled="isFetchingNextPage"
            @click="loadMore"
          >
            <LoaderCircle
              v-if="isFetchingNextPage"
              class="size-4 animate-spin text-primary"
            />
            {{ isFetchingNextPage ? 'Loading…' : 'Load more' }}
          </button>
        </div>
      </template>

      <!-- Empty state -->
      <div
        v-else
        class="flex animate-row-in flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
      >
        <div class="grid size-11 place-items-center rounded-full bg-muted">
          <Search class="size-5 text-muted-foreground" />
        </div>
        <p class="text-sm font-medium text-foreground">No issues.</p>
        <p class="max-w-xs text-xs text-muted-foreground">
          Nothing matches the current filters — adjust them above, or create one.
        </p>
      </div>
    </template>
  </section>
</template>
