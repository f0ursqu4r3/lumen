<script setup lang="ts">
import { Search, RefreshCw, CheckSquare, List, Columns3 } from '@lucide/vue'
import { Input } from '@/shared/ui/input'
import IssueFilterPanel from '@/features/issues/components/IssueFilterPanel.vue'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { SORTS, GROUPS, BOARD_GROUPS } from '@/features/issues/lib/issueView'
import type { IssueFilters } from '@/gitlab/issueParams'
import type { ProjectLabel } from '@/features/labels/composables/useProjectLabels'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'

type StateValue = NonNullable<IssueFilters['state']>
const STATES: { value: StateValue; label: string }[] = [
  { value: 'opened', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

defineProps<{
  catalog: ProjectLabel[]
  members: ProjectMember[]
  activeCount: number
  view: 'list' | 'board'
  selectMode: boolean
  isRefreshing: boolean
  scopeOptions: string[]
}>()

const state = defineModel<StateValue>('state', { required: true })
const search = defineModel<string>('search', { required: true })
const labels = defineModel<string[]>('labels', { required: true })
const assignee = defineModel<string>('assignee', { required: true })
const author = defineModel<string>('author', { required: true })
const sortKey = defineModel<string>('sort', { required: true })
const groupKey = defineModel<string>('group', { required: true })
const boardScope = defineModel<string>('scope', { required: true })

defineEmits<{ refresh: []; 'toggle-select': []; 'set-view': [next: 'list' | 'board'] }>()
</script>

<template>
  <!-- Toolbar row 1: state · search · view -->
  <div class="flex flex-wrap items-center gap-2">
    <div
      role="group"
      aria-label="Filter issues by state"
      class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
    >
      <button
        v-for="s in STATES"
        :key="s.value"
        type="button"
        :aria-pressed="state === s.value"
        class="rounded-[7px] px-3 py-1 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
        :class="
          state === s.value
            ? 'bg-card text-foreground shadow-card ring-1 ring-border'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="state = s.value"
      >
        {{ s.label }}
      </button>
    </div>

    <div class="relative min-w-50 flex-1">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="search"
        type="search"
        placeholder="Search issues…"
        aria-label="Search issues"
        class="pl-9"
      />
    </div>

    <IssueFilterPanel
      v-model:labels="labels"
      v-model:assignee="assignee"
      v-model:author="author"
      :catalog="catalog"
      :members="members"
      :active-count="activeCount"
    />

    <slot name="saved-views" />

    <!-- Manual refresh: re-fetches loaded pages on demand, on top of the
         background poll. Spins only while the user's own refresh is in flight. -->
    <button
      type="button"
      data-testid="refresh-issues"
      aria-label="Refresh issues"
      title="Refresh"
      :disabled="isRefreshing"
      class="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97] disabled:opacity-60"
      @click="$emit('refresh')"
    >
      <RefreshCw class="size-4" :class="isRefreshing ? 'animate-spin' : ''" />
    </button>

    <!-- Select mode: flips rows/cards into checkbox selection for bulk actions. -->
    <button
      type="button"
      data-testid="toggle-select-mode"
      aria-label="Toggle select mode"
      title="Select mode"
      :aria-pressed="selectMode"
      class="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
      :class="selectMode ? 'bg-card text-foreground ring-1 ring-border' : ''"
      @click="$emit('toggle-select')"
    >
      <CheckSquare class="size-4" />
    </button>

    <!-- View toggle -->
    <div
      role="group"
      aria-label="Switch view"
      class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
    >
      <button
        type="button"
        aria-label="List view"
        :aria-pressed="view === 'list'"
        class="grid size-7 place-items-center rounded-[7px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
        :class="
          view === 'list'
            ? 'bg-card text-foreground shadow-card ring-1 ring-border'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('set-view', 'list')"
      >
        <List class="size-4" />
      </button>
      <button
        type="button"
        aria-label="Board view"
        :aria-pressed="view === 'board'"
        class="grid size-7 place-items-center rounded-[7px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
        :class="
          view === 'board'
            ? 'bg-card text-foreground shadow-card ring-1 ring-border'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('set-view', 'board')"
      >
        <Columns3 class="size-4" />
      </button>
    </div>
  </div>

  <!-- Toolbar row 2: sort + group (list only) -->
  <div v-if="view === 'list'" class="flex flex-wrap items-center gap-2">
    <Select v-model="sortKey">
      <SelectTrigger class="h-8 w-44 text-xs" aria-label="Sort issues">
        <span class="text-muted-foreground">Sort</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="s in SORTS" :key="s.value" :value="s.value">
          {{ s.label }}
        </SelectItem>
      </SelectContent>
    </Select>
    <Select v-model="groupKey">
      <SelectTrigger class="h-8 w-44 text-xs" aria-label="Group issues">
        <span class="text-muted-foreground">Group</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="g in GROUPS" :key="g.value" :value="g.value">
          {{ g.label }}
        </SelectItem>
        <!-- One entry per scoped-label group present in the project (team::,
             type::, …), grouping the list the same way the board's columns do. -->
        <template v-if="scopeOptions.length">
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Labels</SelectLabel>
            <SelectItem v-for="s in scopeOptions" :key="s" :value="`label:${s}`">
              {{ s }}
            </SelectItem>
          </SelectGroup>
        </template>
      </SelectContent>
    </Select>
  </div>

  <!-- Toolbar row 2 (board): sort cards + which facet becomes the columns -->
  <div v-else class="flex flex-wrap items-center gap-2">
    <Select v-model="sortKey">
      <SelectTrigger class="h-8 w-44 text-xs" aria-label="Sort issues">
        <span class="text-muted-foreground">Sort</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="s in SORTS" :key="s.value" :value="s.value">
          {{ s.label }}
        </SelectItem>
      </SelectContent>
    </Select>
    <Select v-model="boardScope">
      <SelectTrigger class="h-8 w-52 text-xs" aria-label="Column grouping">
        <span class="text-muted-foreground">Columns by</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="g in BOARD_GROUPS" :key="g.value" :value="g.value">
          {{ g.label }}
        </SelectItem>
        <!-- Same scoped-label groups the list offers — each becomes a column set. -->
        <template v-if="scopeOptions.length">
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Labels</SelectLabel>
            <SelectItem v-for="s in scopeOptions" :key="s" :value="`label:${s}`">
              {{ s }}
            </SelectItem>
          </SelectGroup>
        </template>
      </SelectContent>
    </Select>
    <span class="text-xs text-muted-foreground/60">Drag cards to update</span>
  </div>
</template>
