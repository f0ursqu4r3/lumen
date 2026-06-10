<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import SettingsDialog from '@/shared/components/SettingsDialog.vue'
import ToastHost from '@/shared/components/ToastHost.vue'
import SessionExpiredOverlay from '@/shared/components/SessionExpiredOverlay.vue'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import CommandPalette from '@/shared/components/CommandPalette.vue'
import AppShell from '@/shared/components/shell/AppShell.vue'
import IssueSavebarSlot from '@/features/issues/components/IssueSavebarSlot.vue'
import { shouldShowChrome } from '@/shared/lib/chrome'
import { registerSettingsShortcut } from '@/shared/composables/useSettings'

// The native app menu (⌘,) dispatches lumen:open-settings into the webview;
// listen for it app-wide so the single mounted dialog opens from anywhere.
let stop: (() => void) | null = null
onMounted(() => {
  stop = registerSettingsShortcut()
})
onUnmounted(() => stop?.())

const route = useRoute()
const chrome = computed(() => shouldShowChrome(route))
// Popped-out windows (?window=1) carry no rail, but echo the shell's signature:
// a rounded card panel floating on the bare background.
const windowed = computed(() => route.query.window === '1')
// The multi-issue window owns its own header + scroll region (the pager stays
// fixed while issues scroll beneath it); other windows scroll the whole panel.
const multiWindow = computed(() => route.name === 'issues-window')
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
       panel the shell uses, floating on a thin background frame. The panel is a
       fixed-height column that scrolls internally so the window itself never
       scrolls. -->
  <div v-else-if="windowed" class="flex h-screen flex-col bg-background p-1.5 text-foreground">
    <div
      class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
    >
      <!-- The multi-issue window manages its own fixed pager + scroll region. -->
      <RouterView v-if="multiWindow" :key="$route.path" />
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
  <div v-else class="min-h-screen overflow-x-clip bg-background text-foreground">
    <main class="mx-auto max-w-5xl px-4 py-6">
      <RouterView :key="$route.path" />
    </main>
  </div>
  <!-- Single shared instances for the whole app -->
  <ConfirmDialog />
  <SettingsDialog />
  <ToastHost />
  <SessionExpiredOverlay />
  <ConnectionBanner />
  <CommandPalette />
</template>
