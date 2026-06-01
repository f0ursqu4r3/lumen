<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ state: string; compact?: boolean }>()
const open = computed(() => props.state === 'opened')
const label = computed(() => (open.value ? 'Open' : 'Closed'))
</script>

<template>
  <!-- Compact: a status dot (used in dense lists where the column is implied).
       Full: a pill with a leading dot (used on the detail page). -->
  <span
    v-if="compact"
    :title="label"
    :aria-label="label"
    class="inline-block size-2.5 shrink-0 rounded-full ring-2"
    :class="
      open
        ? 'bg-emerald-500 ring-emerald-500/20'
        : 'bg-neutral-300 ring-neutral-300/30'
    "
  />
  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
    :class="
      open
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-neutral-200 bg-neutral-100 text-neutral-600'
    "
  >
    <span
      class="size-1.5 rounded-full"
      :class="open ? 'bg-emerald-500' : 'bg-neutral-400'"
    />
    {{ label }}
  </span>
</template>
