<script setup lang="ts">
import { computed } from 'vue'
import { useIsFetching } from '@tanstack/vue-query'

// The chassis bar IS the window titlebar: the OS titlebar is hidden
// (titleBarStyle: 'hiddenInset' in src/bun), the native traffic lights float
// over the reserved left zone, and electrobun's preload turns the app-region
// classes into real window-drag behavior. Interactive children must opt out
// with the no-drag class.
defineProps<{ title?: string }>()

const fetching = useIsFetching()
const busy = computed(() => fetching.value > 0)
</script>

<template>
  <div
    data-testid="chassis-bar"
    class="electrobun-webkit-app-region-drag relative flex h-9 shrink-0 items-center gap-3 pr-4 pl-18 select-none"
  >
    <span class="font-mono text-2xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
      {{ title ?? 'Lumen' }}
    </span>
    <span class="flex-1" />
    <!-- Liveness lamp: steady orange when idle, breathes while fetching. -->
    <span
      data-testid="chassis-lamp"
      role="status"
      class="electrobun-webkit-app-region-no-drag size-1.5 rounded-full bg-primary"
      :class="busy && 'lamp-busy'"
      :title="busy ? 'Syncing…' : 'Connected'"
      :aria-label="busy ? 'Syncing' : 'Connected'"
    />
  </div>
</template>
