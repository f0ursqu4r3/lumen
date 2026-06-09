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
</script>

<template>
  <!-- Key on path (not fullPath) so route/param changes remount the view —
       keeping composables that capture route params at setup from going
       stale — while query-only changes (e.g. the ?issue drawer) overlay the
       list without remounting or refetching it. -->
  <AppShell v-if="chrome">
    <RouterView :key="$route.path" />
  </AppShell>
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
