<script setup lang="ts">
// Label filtering is fully wired in the data layer (useMrFilters.labels →
// labelName) and round-trips through the URL + saved views, but has no UI
// surface yet. TODO(v1.1): add a label flyout here, reusing the issues' labels
// picker, mirroring how the issue filter panel grew.
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { SlidersHorizontal } from '@lucide/vue'
import type { MrDraft } from '@/features/merge_requests/lib/mrView'
import { Input } from '@/shared/ui/input'

defineProps<{ activeCount: number }>()
const emit = defineEmits<{ clear: [] }>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
onClickOutside(root, () => (open.value = false))

const draft = defineModel<MrDraft>('draft', { required: true })
const author = defineModel<string>('author', { required: true })
const assignee = defineModel<string>('assignee', { required: true })
const reviewer = defineModel<string>('reviewer', { required: true })
const milestone = defineModel<string>('milestone', { required: true })

const DRAFTS: { value: MrDraft; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
]
</script>

<template>
  <div ref="root" class="relative" @keydown.escape="open = false">
    <button
      type="button"
      data-testid="mr-filter-trigger"
      :aria-expanded="open"
      class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="open = !open"
    >
      <SlidersHorizontal class="size-4" />
      Filters
      <span
        v-if="activeCount"
        data-testid="mr-filter-count"
        class="ml-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-micro font-semibold text-primary-foreground tabular-nums"
      >
        {{ activeCount }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-50 mt-1 w-72 space-y-3 rounded-lg border border-border bg-popover p-3 shadow-md"
    >
      <section class="space-y-1.5">
        <p class="px-1 text-micro font-medium tracking-wide text-muted-foreground uppercase">
          Draft
        </p>
        <div class="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          <button
            v-for="d in DRAFTS"
            :key="d.value"
            type="button"
            :aria-pressed="draft === d.value"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            :class="
              draft === d.value
                ? 'bg-card text-foreground shadow-card ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="draft = d.value"
          >
            {{ d.label }}
          </button>
        </div>
      </section>

      <section class="space-y-1.5">
        <p class="px-1 text-micro font-medium tracking-wide text-muted-foreground uppercase">
          People &amp; milestone
        </p>
        <Input v-model="author" placeholder="author" aria-label="Author username" class="h-8" />
        <Input
          v-model="assignee"
          placeholder="assignee"
          aria-label="Assignee username"
          class="h-8"
        />
        <Input
          v-model="reviewer"
          placeholder="reviewer"
          aria-label="Reviewer username"
          class="h-8"
        />
        <Input
          v-model="milestone"
          placeholder="milestone"
          aria-label="Milestone title"
          class="h-8"
        />
      </section>

      <button
        v-if="activeCount"
        type="button"
        data-testid="mr-filter-clear"
        class="w-full rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
        @click="emit('clear')"
      >
        Clear filters
      </button>
    </div>
  </div>
</template>
