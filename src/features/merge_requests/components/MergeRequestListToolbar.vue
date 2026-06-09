<script setup lang="ts">
import { Search } from '@lucide/vue'
import { Input } from '@/shared/ui/input'
import SavedViews from '@/shared/components/SavedViews.vue'
import { MR_SORT_OPTIONS, type MrSortKey } from '@/features/merge_requests/lib/mrView'
import type { SavedView } from '@/shared/composables/useSavedViews'

defineProps<{
  views: SavedView[]
  activeId: string | null
  loadedId: string | null
  canSave: boolean
}>()
const emit = defineEmits<{
  apply: [view: SavedView]
  save: [name: string]
  update: [id: string]
  rename: [id: string, name: string]
  remove: [id: string]
}>()

const search = defineModel<string>('search', { required: true })
const sort = defineModel<MrSortKey>('sort', { required: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex min-w-48 flex-1 items-center gap-2 rounded-md border border-border px-2">
      <Search class="size-4 shrink-0 text-muted-foreground" />
      <Input
        v-model="search"
        type="search"
        placeholder="Search merge requests…"
        aria-label="Search merge requests"
        class="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
      />
    </div>
    <select
      v-model="sort"
      aria-label="Sort"
      class="rounded-md border border-border bg-background px-2 py-1 text-sm"
    >
      <option v-for="o in MR_SORT_OPTIONS" :key="o.key" :value="o.key">{{ o.label }}</option>
    </select>
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
</template>
