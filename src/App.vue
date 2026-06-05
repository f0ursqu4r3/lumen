<script setup lang="ts">
import ConfirmDialog from '@/components/ConfirmDialog.vue'
</script>

<template>
  <div class="min-h-screen overflow-x-clip bg-background text-foreground">
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
