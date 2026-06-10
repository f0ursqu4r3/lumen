<script setup lang="ts">
import { computed } from 'vue'
import { Circle } from '@lucide/vue'
import { sessionState } from '@/shared/composables/useSession'

// The dock is the rail's horizontal twin: a slim strip in the dark background
// gutter along the bottom, framing the floating content panel on a second edge.
// It carries the connection signal today, with room for more status at the right.
const connectionClass = computed(() =>
  sessionState.unavailable ? 'text-amber-400' : 'text-emerald-500/70',
)
</script>

<template>
  <footer class="flex h-6 shrink-0 items-center gap-2 px-3 text-2xs" aria-label="Status">
    <span
      data-testid="status-connection"
      class="inline-flex items-center gap-1.5"
      :class="connectionClass"
      :title="sessionState.unavailable ? 'Reconnecting…' : 'Connected'"
    >
      <Circle class="size-2 fill-current" />
      <span class="font-medium tracking-wide">
        {{ sessionState.unavailable ? 'Reconnecting…' : 'Connected' }}
      </span>
    </span>
  </footer>
</template>
