<script setup lang="ts">
defineProps<{ username: string; avatarUrl?: string | null }>()
</script>
<template>
  <span class="inline-flex items-center gap-1 text-xs text-neutral-600" :title="username">
    <img v-if="avatarUrl" :src="avatarUrl" :alt="username" class="h-5 w-5 rounded-full" />
    <span>@{{ username }}</span>
  </span>
</template>
