<script setup lang="ts">
import { Search } from '@lucide/vue'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import RefreshButton from '@/shared/components/RefreshButton.vue'
import SavedViews from '@/shared/components/SavedViews.vue'
import { MR_SORT_OPTIONS, type MrSortKey, type MrState } from '@/features/merge_requests/lib/mrView'
import type { SavedView } from '@/shared/composables/useSavedViews'

const STATES: { value: MrState; label: string }[] = [
  { value: 'opened', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

defineProps<{
  count: number
  hasMore: boolean
  isRefreshing: boolean
  views: SavedView[]
  activeId: string | null
  loadedId: string | null
  canSave: boolean
}>()
const emit = defineEmits<{
  refresh: []
  apply: [view: SavedView]
  save: [name: string]
  update: [id: string]
  rename: [id: string, name: string]
  remove: [id: string]
}>()

const search = defineModel<string>('search', { required: true })
const sort = defineModel<MrSortKey>('sort', { required: true })
const state = defineModel<MrState>('state', { required: true })
</script>

<template>
  <!-- One cluster, tight internal rhythm — mirrors the issue list toolbar. -->
  <div class="space-y-2.5">
    <!-- Row 1: state · search · filters · views -->
    <div class="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Filter merge requests by state"
        class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
      >
        <button
          v-for="s in STATES"
          :key="s.value"
          type="button"
          :aria-pressed="state === s.value"
          class="rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
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
          placeholder="Search merge requests…"
          aria-label="Search merge requests"
          class="pl-9"
        />
      </div>

      <!-- Author / assignee / reviewer / milestone / draft live behind a popover. -->
      <slot name="filters" />

      <RefreshButton
        data-testid="refresh-mrs"
        label="Refresh merge requests"
        :refreshing="isRefreshing"
        @refresh="emit('refresh')"
      />

      <SavedViews
        :views="views"
        :active-id="activeId"
        :loaded-id="loadedId"
        :can-save="canSave"
        @apply="emit('apply', $event)"
        @save="emit('save', $event)"
        @update="emit('update', $event)"
        @rename="(id, name) => emit('rename', id, name)"
        @remove="emit('remove', $event)"
      />
    </div>

    <!-- Row 2: sort on the left, the filtered tally on the right. -->
    <div class="flex flex-wrap items-center gap-2">
      <Select v-model="sort">
        <SelectTrigger class="h-8 w-44 text-xs" aria-label="Sort merge requests">
          <span class="text-muted-foreground">Sort</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="o in MR_SORT_OPTIONS" :key="o.key" :value="o.key">
            {{ o.label }}
          </SelectItem>
        </SelectContent>
      </Select>

      <div class="ml-auto flex items-baseline gap-1.5">
        <span class="font-mono text-sm font-medium tabular-nums text-foreground">
          {{ count }}<span v-if="hasMore" class="text-primary">+</span>
        </span>
        <span
          class="font-mono text-micro font-medium tracking-[0.18em] text-muted-foreground/55 uppercase"
        >
          {{ count === 1 ? 'mr' : 'mrs' }}
        </span>
      </div>
    </div>
  </div>
</template>
