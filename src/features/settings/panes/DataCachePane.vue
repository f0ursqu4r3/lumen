<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import { useQueryClient } from '@tanstack/vue-query'
import { Button } from '@/shared/ui/button'
import { clearPersistedCache } from '@/shared/lib/persist'
import { pushToast } from '@/shared/composables/useToast'
import { rpc } from '@/shared/lib/rpc'
import PaneHeader from './PaneHeader.vue'

const queryClient = useQueryClient()
async function clearCache() {
  queryClient.clear()
  clearPersistedCache()
  await rpc.notifyCacheCleared()
  pushToast({ title: 'Cache cleared', tone: 'success' })
}
</script>

<template>
  <section class="max-w-lg space-y-4">
    <PaneHeader
      eyebrow="Data & cache"
      title="Local data"
      description="Cached GitLab data is stored on this machine for fast loads."
    />
    <Button data-testid="settings-clear-cache" variant="outline" @click="clearCache">
      <Trash2 class="size-4" /> Clear cached data
    </Button>
  </section>
</template>
