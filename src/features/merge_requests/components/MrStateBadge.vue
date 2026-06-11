<script setup lang="ts">
import { computed } from 'vue'
import { mrStateLabel } from '@/features/merge_requests/lib/mrView'

const props = defineProps<{ state: string; draft: boolean }>()

const kind = computed(() => mrStateLabel({ state: props.state, draft: props.draft }))
const label = computed(
  () => ({ draft: 'Draft', open: 'Open', merged: 'Merged', closed: 'Closed' })[kind.value],
)
const tone = computed(
  () =>
    ({
      draft: 'bg-muted text-muted-foreground ring-border',
      open: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
      merged: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
      closed: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    })[kind.value],
)
</script>

<template>
  <span
    class="inline-flex items-center rounded-[3px] px-2 py-0.5 font-mono text-2xs font-medium tracking-[0.06em] uppercase ring-1 ring-inset"
    :class="tone"
  >
    {{ label }}
  </span>
</template>
