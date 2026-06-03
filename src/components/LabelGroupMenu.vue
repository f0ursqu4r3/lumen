<script setup lang="ts">
import { ref } from 'vue'
import { Check, ChevronRight } from '@lucide/vue'
import type { ScopeGroup } from '@/lib/labelGroups'

const props = withDefaults(
  defineProps<{
    groups: ScopeGroup[]
    selected: string[]
    flyoutSide?: 'left' | 'right'
  }>(),
  { flyoutSide: 'right' },
)
const emit = defineEmits<{ toggle: [title: string] }>()

// One scope flyout open at a time.
const openKey = ref<string | null>(null)
function toggleScope(key: string) {
  openKey.value = openKey.value === key ? null : key
}
const isSelected = (title: string) => props.selected.includes(title)
const countSelected = (g: ScopeGroup) => g.options.filter((o) => isSelected(o.title)).length
</script>

<template>
  <div class="min-w-44" @keydown.escape.stop="openKey = null">
    <p v-if="!groups.length" class="px-2 py-1.5 text-xs text-muted-foreground">No labels.</p>
    <div v-for="g in groups" :key="g.key" class="relative" @mouseenter="openKey = g.key">
      <button
        type="button"
        :data-testid="`lgm-scope-${g.key}`"
        :aria-expanded="openKey === g.key"
        aria-haspopup="menu"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
        @click="toggleScope(g.key)"
      >
        <span class="flex-1 truncate text-foreground">{{ g.label }}</span>
        <span v-if="countSelected(g)" class="font-mono text-[10px] text-primary tabular-nums">
          {{ countSelected(g) }}
        </span>
        <ChevronRight class="size-3.5 text-muted-foreground" />
      </button>

      <div
        v-if="openKey === g.key"
        role="menu"
        :aria-label="g.label"
        class="absolute top-0 z-50 max-h-60 w-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
        :class="flyoutSide === 'left' ? 'right-full mr-1' : 'left-full ml-1'"
      >
        <button
          v-for="o in g.options"
          :key="o.id"
          type="button"
          role="menuitem"
          :data-testid="`lgm-opt-${o.title}`"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
          @click="emit('toggle', o.title)"
        >
          <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: o.color }" />
          <span class="flex-1 truncate text-foreground">{{ o.value }}</span>
          <Check
            v-if="isSelected(o.title)"
            :data-testid="`lgm-check-${o.title}`"
            class="size-3.5 text-primary"
          />
        </button>
      </div>
    </div>
  </div>
</template>
