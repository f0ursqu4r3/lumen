<script setup lang="ts">
defineProps<{ fullPath: string }>()
</script>

<template>
  <section>
    <h1 class="text-lg font-semibold">Issues</h1>
    <p class="mt-2 text-sm text-neutral-500">
      Filtered issue list for <code>{{ fullPath }}</code> — not yet implemented.
    </p>
  </section>
</template>
