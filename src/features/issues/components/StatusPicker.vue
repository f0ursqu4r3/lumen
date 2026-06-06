<script setup lang="ts">
import { computed, ref, watch, nextTick, type Component } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Circle, CircleDotDashed, CircleCheck, CircleSlash, Check, ChevronDown } from '@lucide/vue'
import type { WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'

const props = withDefaults(
  defineProps<{
    statuses: WorkItemStatus[]
    current: WorkItemStatus | null
    pending?: boolean
    label?: string
  }>(),
  { label: 'Status', pending: false },
)
const emit = defineEmits<{ select: [status: WorkItemStatus] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

// Map GitLab's status category to a lucide glyph; the status's own color tints
// it, so To do/In progress/Done/canceled read at a glance like the GitLab UI.
const ICON: Record<string, Component> = {
  to_do: Circle,
  in_progress: CircleDotDashed,
  done: CircleCheck,
  canceled: CircleSlash,
  triage: Circle,
}
const iconFor = (s: WorkItemStatus) => ICON[s.category] ?? Circle

const isCurrent = (s: WorkItemStatus) => props.current?.id === s.id

async function toggleOpen() {
  open.value = !open.value
}

function choose(s: WorkItemStatus) {
  open.value = false
  if (!isCurrent(s)) emit('select', s)
}
</script>

<template>
  <div ref="root" class="space-y-1.5">
    <span class="field-label">{{ label }}</span>

    <div class="relative">
      <button
        type="button"
        data-testid="status-picker-trigger"
        :disabled="!statuses.length || pending"
        class="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-60"
        :class="pending && 'animate-pulse'"
        @click="toggleOpen"
      >
        <template v-if="current">
          <component
            :is="iconFor(current)"
            class="size-4 shrink-0"
            :style="{ color: current.color }"
          />
          <span class="min-w-0 flex-1 truncate text-foreground">{{ current.name }}</span>
        </template>
        <span v-else class="min-w-0 flex-1 truncate text-muted-foreground">
          {{ statuses.length ? 'Set status' : 'No statuses' }}
        </span>
        <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      <div
        v-if="open"
        class="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-md"
        @keydown.esc="open = false"
      >
        <ul class="max-h-64 overflow-y-auto p-1">
          <li v-for="s in statuses" :key="s.id">
            <button
              type="button"
              :data-testid="`status-opt-${s.name}`"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
              @click="choose(s)"
            >
              <Check
                class="size-3.5 shrink-0"
                :class="isCurrent(s) ? 'text-primary' : 'text-transparent'"
              />
              <component :is="iconFor(s)" class="size-4 shrink-0" :style="{ color: s.color }" />
              <span class="min-w-0 flex-1 truncate">{{ s.name }}</span>
            </button>
          </li>
          <li v-if="!statuses.length" class="px-2 py-3 text-center text-xs text-muted-foreground">
            No statuses found
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
