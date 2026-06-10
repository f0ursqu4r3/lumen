<script setup lang="ts">
// The manual refresh shared by the list views. It force-refetches on click and
// spins only while that user-initiated fetch is in flight — the parent owns a
// dedicated `refreshing` flag so background polls never trigger the spinner.
import { RefreshCw } from '@lucide/vue'

withDefaults(defineProps<{ refreshing: boolean; label?: string }>(), { label: 'Refresh' })
defineEmits<{ refresh: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :disabled="refreshing"
    class="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97] disabled:opacity-60"
    @click="$emit('refresh')"
  >
    <RefreshCw class="size-4" :class="refreshing ? 'animate-spin' : ''" />
  </button>
</template>
