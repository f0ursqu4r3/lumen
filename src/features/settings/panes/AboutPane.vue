<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { rpc } from '@/shared/lib/rpc'
import { PROBE_QUERY } from '@/shared/composables/useGitlabConnect'
import PaneHeader from './PaneHeader.vue'

const version = __APP_VERSION__
const username = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await rpc.gitlabGraphql({ query: PROBE_QUERY, silent: true })
    username.value =
      (res.data as { currentUser?: { username?: string } } | undefined)?.currentUser?.username ??
      null
  } catch {
    username.value = null
  }
})
</script>

<template>
  <section class="max-w-lg space-y-4">
    <PaneHeader eyebrow="About" title="Lumen" />
    <p class="text-sm text-muted-foreground">
      lumen v{{ version }}<span v-if="username"> · @{{ username }}</span>
    </p>
  </section>
</template>
