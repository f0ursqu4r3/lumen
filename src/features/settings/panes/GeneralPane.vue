<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import PaneHeader from './PaneHeader.vue'

const restoreOnStartup = ref(true)
const busy = ref(false)

onMounted(async () => {
  restoreOnStartup.value = (await rpc.getStartupPrefs()).restoreOnStartup
})

async function toggle() {
  if (busy.value) return
  busy.value = true
  try {
    const next = !restoreOnStartup.value
    await rpc.setRestoreOnStartup({ enabled: next })
    restoreOnStartup.value = next
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="max-w-2xl space-y-6">
    <PaneHeader eyebrow="General" title="Startup" description="Control how Lumen launches." />
    <div class="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <span class="flex flex-col">
        <span class="text-sm font-medium text-foreground">Restore windows on startup</span>
        <span class="text-2xs text-muted-foreground">
          Reopen your windows at their last size and position, and return the main window to the
          view you left.
        </span>
      </span>
      <Button
        type="button"
        data-test="restore-toggle"
        :variant="restoreOnStartup ? 'default' : 'outline'"
        :aria-pressed="restoreOnStartup"
        :disabled="busy"
        @click="toggle"
      >
        {{ restoreOnStartup ? 'On' : 'Off' }}
      </Button>
    </div>
  </section>
</template>
