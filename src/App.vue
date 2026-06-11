<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import ToastHost from '@/shared/components/ToastHost.vue'
import SessionExpiredOverlay from '@/shared/components/SessionExpiredOverlay.vue'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import CommandPalette from '@/shared/components/CommandPalette.vue'
import AppShell from '@/shared/components/shell/AppShell.vue'
import ChassisBar from '@/shared/components/shell/ChassisBar.vue'
import IssueSavebarSlot from '@/features/issues/components/IssueSavebarSlot.vue'
import { shouldShowChrome } from '@/shared/lib/chrome'
import { clearPersistedCache } from '@/shared/lib/persist'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const chrome = computed(() => shouldShowChrome(route))
// Popped-out windows (?window=1) carry no rail, but echo the shell's signature:
// a rounded card panel floating on the bare background.
const windowed = computed(() => route.query.window === '1')
const windowTitle = computed(() => (route.name === 'settings' ? 'Settings' : undefined))
// The multi-issue window owns its own header + scroll region (the pager stays
// fixed while issues scroll beneath it); other windows scroll the whole panel.
const multiWindow = computed(() => route.name === 'issues-window')
// Windows that own their full surface (no centered max-width content wrapper):
// the multi-issue pager and the two-pane settings shell.
const fullBleedWindow = computed(() => multiWindow.value || route.name === 'settings')

// Host-bridged events from the separate settings window (see src/bun/index.ts).
function onDisconnected() {
  queryClient.clear()
  clearPersistedCache()
  router.replace({ name: 'connect' })
}
function onCacheCleared() {
  queryClient.clear()
}
onMounted(() => {
  window.addEventListener('lumen:disconnected', onDisconnected)
  window.addEventListener('lumen:cache-cleared', onCacheCleared)
})
onUnmounted(() => {
  window.removeEventListener('lumen:disconnected', onDisconnected)
  window.removeEventListener('lumen:cache-cleared', onCacheCleared)
})
</script>

<template>
  <!-- Key on path (not fullPath) so route/param changes remount the view —
       keeping composables that capture route params at setup from going
       stale — while query-only changes (e.g. the ?issue drawer) overlay the
       list without remounting or refetching it. -->
  <AppShell v-if="chrome">
    <RouterView :key="$route.path" />
  </AppShell>
  <!-- Popped-out window: no rail, but the content rides in the same rounded card
       panel the shell uses, floating on a thin background frame. The ChassisBar
       spans the full window width as the custom titlebar (OS titlebar is hidden).
       The panel is a fixed-height column that scrolls internally so the window
       itself never scrolls. -->
  <div
    v-else-if="windowed"
    class="flex h-screen flex-col overflow-hidden bg-background text-foreground"
  >
    <ChassisBar :title="windowTitle" />
    <div class="flex min-h-0 flex-1 flex-col px-1.5 pb-1.5">
      <div
        class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
      >
        <!-- The multi-issue window manages its own fixed pager + scroll region.
             The settings shell is also full-bleed (two-pane, no max-width inset). -->
        <RouterView v-if="fullBleedWindow" :key="$route.path" />
        <div v-else class="min-h-0 flex-1 overflow-y-auto overflow-x-clip">
          <main class="mx-auto max-w-5xl px-4 py-6">
            <RouterView :key="$route.path" />
          </main>
        </div>
      </div>
      <!-- The issue save/revert dock lands here, on the bare background below the
           panel, when there are unsaved edits. -->
      <IssueSavebarSlot />
    </div>
  </div>
  <div v-else class="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
    <ChassisBar />
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <RouterView :key="$route.path" />
    </main>
  </div>
  <!-- Single shared instances for the whole app -->
  <ConfirmDialog />
  <ToastHost />
  <SessionExpiredOverlay />
  <ConnectionBanner />
  <CommandPalette />
</template>
