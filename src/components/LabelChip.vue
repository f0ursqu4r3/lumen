<script setup lang="ts">
defineProps<{ title: string; color: string }>()
</script>
<template>
  <span
    class="inline-block rounded px-1.5 py-0.5 text-xs font-medium text-white"
    :style="{ backgroundColor: color }"
  >{{ title }}</span>
</template>
