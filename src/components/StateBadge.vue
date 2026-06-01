<script setup lang="ts">
const props = defineProps<{ state: string }>()
const open = props.state === 'opened'
</script>
<template>
  <span
    class="rounded px-1.5 py-0.5 text-xs font-medium"
    :class="open ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700'"
  >{{ open ? 'Open' : 'Closed' }}</span>
</template>
