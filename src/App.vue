<script setup lang="ts">
import { computed } from 'vue'
import { useIsFetching } from '@tanstack/vue-query'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// The signal lamp breathes while any query is in flight — a quiet liveness
// readout for an instrument that's meant to feel alive without being noisy.
const fetching = useIsFetching()
const busy = computed(() => fetching.value > 0)
</script>

<template>
  <div class="min-h-screen overflow-x-clip bg-background text-foreground">
    <header class="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div class="mx-auto flex h-14 max-w-5xl items-center px-4">
        <RouterLink
          to="/"
          class="group inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <!-- Amber signal lamp — a quiet operational/telemetry nod. Steady when
               idle; a slow breath while fetching (see .lamp-busy in styles.css). -->
          <span
            class="size-2 rounded-full bg-primary shadow-[0_0_8px_oklch(0.82_0.142_81/0.6)] transition-shadow group-hover:shadow-[0_0_12px_oklch(0.82_0.142_81/0.9)]"
            :class="busy && 'lamp-busy'"
            :title="busy ? 'Syncing…' : 'Idle'"
          />
          <span class="font-mono lowercase">lumen</span>
        </RouterLink>
      </div>
    </header>
    <!-- Key on path (not fullPath) so route/param changes remount the view —
         keeping composables that capture route params at setup from going
         stale — while query-only changes (e.g. the ?issue drawer) overlay the
         list without remounting or refetching it. -->
    <main class="mx-auto max-w-5xl px-4 py-6">
      <RouterView :key="$route.path" />
    </main>
  </div>
  <!-- Single confirm dialog instance shared across the whole app -->
  <ConfirmDialog />
</template>
