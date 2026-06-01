<script setup lang="ts">
defineProps<{ fullPath: string; iid: string }>()
</script>

<template>
  <section>
    <h1 class="text-lg font-semibold">Issue #{{ iid }}</h1>
    <p class="mt-2 text-sm text-neutral-500">
      Detail + notes for <code>{{ fullPath }}</code> — not yet implemented.
    </p>
  </section>
</template>
