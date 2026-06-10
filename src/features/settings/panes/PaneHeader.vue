<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; description?: string }>()
</script>

<template>
  <header class="space-y-1">
    <p class="font-mono text-2xs font-semibold tracking-[0.13em] text-primary uppercase">
      {{ eyebrow }}
    </p>
    <h2 class="text-base font-semibold text-foreground">{{ title }}</h2>
    <p v-if="description" class="max-w-prose text-sm text-muted-foreground">{{ description }}</p>
  </header>
</template>
